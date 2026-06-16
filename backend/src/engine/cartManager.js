const pool = require('../db');
const { insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');
const catalogData = require('../catalogData');

// Robust TSV Parser to handle multi-line quotes and TSV structure
function parseTSV(text) {
  const result = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i+1];
    if (inQuotes) {
      if (char === '"') {
        if (next === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === '\t') { row.push(field); field = ''; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && next === '\n') { i++; }
        row.push(field); result.push(row); row = []; field = '';
      } else { field += char; }
    }
  }
  if (field || row.length > 0) { row.push(field); result.push(row); }
  return result;
}

// Fetch live products
async function fetchLiveProducts() {
  try {
    const feedUrl = process.env.WIX_FEED_URL;
    if (!feedUrl) return catalogData;
    const res = await fetch(feedUrl);
    const text = await res.text();
    const rows = parseTSV(text);
    if (rows.length < 2) return catalogData;
    
    const headers = rows[0];
    const items = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < headers.length) continue;
      const item = {};
      headers.forEach((h, idx) => { item[h] = row[idx]; });
      if (item.id && item.title) items.push(item);
    }
    
    const productMap = new Map();
    for (const item of items) {
      const key = item.item_group_id && item.item_group_id !== "undefined" ? item.item_group_id : item.title.trim();
      if (!productMap.has(key)) productMap.set(key, item);
    }
    
    return Array.from(productMap.values()).map(item => ({
      id: item.id,
      retailer_id: item.id,
      name: item.title,
      description: item.description,
      price: String(item.price || "0").replace(/[^0-9.]/g, ''),
      image_url: item.image_link
    }));
  } catch (err) {
    console.error("[cartManager] TSV fetch error:", err.message);
    return catalogData;
  }
}

async function getOrCreateCart(whatsappId) {
  const res = await pool.query(`SELECT * FROM coexistence.meenzy_carts WHERE whatsapp_id = $1 AND status = 'active'`, [whatsappId]);
  if (res.rows.length > 0) return res.rows[0];
  
  const insertRes = await pool.query(`
    INSERT INTO coexistence.meenzy_carts (whatsapp_id, current_state, state_context, status, cart_items, updated_at)
    VALUES ($1, 'BROWSING', '{}'::jsonb, 'active', '[]'::jsonb, now())
    ON CONFLICT (whatsapp_id) 
    DO UPDATE SET 
      current_state = 'BROWSING', 
      state_context = '{}'::jsonb,
      status = 'active',
      cart_items = '[]'::jsonb,
      updated_at = now()
    RETURNING *
  `, [whatsappId]);
  return insertRes.rows[0];
}

async function updateCartState(whatsappId, state, context = {}) {
  await pool.query(`
    UPDATE coexistence.meenzy_carts 
    SET current_state = $1, state_context = $2, updated_at = NOW()
    WHERE whatsapp_id = $3 AND status = 'active'
  `, [state, JSON.stringify(context), whatsappId]);
}

async function sendMessage(whatsappId, account, payload, text = '') {
  const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'interactive', messageBody: text });
  await enqueueSend({ kind: 'interactive', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { interactive: payload } });
}

async function sendQuantityPicker(whatsappId, account, productId) {
  const catalog = await fetchLiveProducts();
  const product = catalog.find(p => p.id === productId || p.retailer_id === productId);
  if (!product) return;

  const price = parseFloat(product.price);
  const halfPrice = price / 2;
  
  const payload = {
    type: "button",
    body: {
      text: `🐟 *${product.name} - Premium Cut*\n\nFreshly caught and cleaned. How much would you like to add to your cart?`
    },
    action: {
      buttons: [
        { type: "reply", reply: { id: `C_ADD:${productId}:0.5`, title: `+ 500g (₹${halfPrice})` } },
        { type: "reply", reply: { id: `C_ADD:${productId}:1.0`, title: `+ 1 Kg (₹${price})` } }
      ]
    }
  };
  await sendMessage(whatsappId, account, payload, 'Quantity Picker');
}

async function addItemToCart(whatsappId, productId, qty) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(`SELECT cart_items FROM coexistence.meenzy_carts WHERE whatsapp_id = $1 AND status = 'active' FOR UPDATE`, [whatsappId]);
    if (res.rows.length === 0) throw new Error('No active cart found');
    let items = res.rows[0].cart_items || [];
    
    const catalog = await fetchLiveProducts();
    const product = catalog.find(p => p.id === productId || p.retailer_id === productId);
    if (!product) throw new Error(`Product ${productId} not found`);
    
    let existingItem = items.find(i => i.product_id === productId);
    if (existingItem) {
      existingItem.quantity += qty;
    } else {
      items.push({
        product_id: productId,
        base_name: product.name,
        variant: 'Default',
        quantity: qty,
        price_per_kg: parseFloat(product.price)
      });
    }
    
    await client.query(`
      UPDATE coexistence.meenzy_carts 
      SET cart_items = $1::jsonb, updated_at = NOW() 
      WHERE whatsapp_id = $2 AND status = 'active'
    `, [JSON.stringify(items), whatsappId]);
    
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[cartManager] addItemToCart Error:', e.message);
  } finally {
    client.release();
  }
}

async function sendCartSummary(whatsappId, account) {
  const res = await pool.query(`SELECT cart_items FROM coexistence.meenzy_carts WHERE whatsapp_id = $1 AND status = 'active'`, [whatsappId]);
  if (res.rows.length === 0 || res.rows[0].cart_items.length === 0) {
    const text = "🛒 Your cart is empty!\nReply *Hi* to see the fresh catch menu.";
    const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: text });
    await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
    return;
  }

  const items = res.rows[0].cart_items;
  let grandTotal = 0;
  const lines = items.map(item => {
    const lineTotal = item.quantity * item.price_per_kg;
    grandTotal += lineTotal;
    return `• *${item.base_name}* (${item.quantity} Kg) — ₹${lineTotal}`;
  });

  const text = `🛒 *Your Meenzy Cart*\n\n${lines.join('\n')}\n\n🧾 *Subtotal: ₹${grandTotal}*\n🚚 *Delivery: Free*\n\n💰 *Total: ₹${grandTotal}*`;

  const payload = {
    type: "button",
    body: { text },
    action: {
      buttons: [
        { type: "reply", reply: { id: "C_CHECKOUT", title: "Checkout 🚀" } },
        { type: "reply", reply: { id: "C_CLEAR", title: "Empty Cart" } }
      ]
    }
  };
  await sendMessage(whatsappId, account, payload, 'Cart Summary');
}

async function checkoutCart(whatsappId, account) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(`SELECT * FROM coexistence.meenzy_carts WHERE whatsapp_id = $1 AND status = 'active' FOR UPDATE`, [whatsappId]);
    if (res.rows.length === 0 || res.rows[0].cart_items.length === 0) throw new Error('No active cart found');
    const cart = res.rows[0];
    
    // Create Preorder
    const orderId = 'MNZ-' + Math.floor(1000 + Math.random() * 9000);
    const totalAmt = cart.cart_items.reduce((sum, item) => sum + (item.quantity * item.price_per_kg), 0);
    
    // Insert items into meenzy_preorders
    for (const item of cart.cart_items) {
      await client.query(
        `INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status)
         VALUES ($1, $2, $3, 'AWAITING_DELIVERY_PREF')`,
        [whatsappId, item.base_name, item.quantity]
      );
    }
    
    // Keep cart active to wait for delivery preference
    await client.query(`UPDATE coexistence.meenzy_carts SET current_state = 'AWAITING_DELIVERY_PREF', updated_at = NOW() WHERE whatsapp_id = $1 AND status = 'active'`, [whatsappId]);
    
    await client.query('COMMIT');
    
    // Send Order Confirmation as Meta Template
    const itemsList = cart.cart_items.map(item => `${item.base_name} (${item.quantity} Kg)`);
    const receiptSummary = `Items: ${itemsList.join(', ')} | Total: ₹${totalAmt}`;
    const trackingId = orderId;
    const templateMsg = `Order confirmed. Receipt: ${receiptSummary}. Tracking: ${trackingId}`;
    
    const localId = await insertPendingRow({
      account,
      toNumber: whatsappId,
      messageType: 'template',
      messageBody: templateMsg,
      templateMeta: {
        name: 'meenzy_order_confirmation',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: receiptSummary },
              { type: 'text', text: trackingId }
            ]
          }
        ]
      }
    });

    await enqueueSend({
      kind: 'template',
      accountId: account.id,
      to: String(whatsappId).replace(/\D/g, ''),
      localMessageId: localId,
      payload: {
        name: 'meenzy_order_confirmation',
        languageCode: 'en',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: receiptSummary },
              { type: 'text', text: trackingId }
            ]
          }
        ]
      }
    });

    // Send Delivery Request Message
    const { getDeliveryPayload } = require('../services/deliveryScheduler');
    const deliveryPayload = getDeliveryPayload();
    await sendMessage(whatsappId, account, deliveryPayload, 'Request Delivery Schedule');

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[cartManager] checkoutCart Error:', e.message);
  } finally {
    client.release();
  }
}

async function emptyCart(whatsappId, account) {
  await pool.query(`UPDATE coexistence.meenzy_carts SET status = 'abandoned', updated_at = NOW() WHERE whatsapp_id = $1 AND status = 'active'`, [whatsappId]);
  const text = "🗑️ Your cart has been emptied. Reply *Hi* to browse again!";
  const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: text });
  await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
}

// The Main Entrypoint for State Machine
async function handleCartState(whatsappId, account, incomingPayload) {
  const cart = await getOrCreateCart(whatsappId);
  
  if (incomingPayload === 'C_CLEAR') {
    await emptyCart(whatsappId, account);
    return true; // handled
  }

  if (incomingPayload === 'C_CHECKOUT') {
    await checkoutCart(whatsappId, account);
    return true; // handled
  }

  // Handle Delivery Schedule
  if (incomingPayload.startsWith('C_DEL:')) {
    const parts = incomingPayload.split(':');
    if (parts.length >= 3) {
      const deliveryDate = parts[1]; // e.g. "Today", "Tomorrow", or numeric string "0", "1", "2"
      const deliveryTime = parts.slice(2).join(':'); // Time string
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Calculate date offset (Today=0, Tomorrow=1, otherwise parse integer)
        let dateOffset = 0;
        if (deliveryDate === 'Today') {
          dateOffset = 0;
        } else if (deliveryDate === 'Tomorrow') {
          dateOffset = 1;
        } else {
          dateOffset = parseInt(deliveryDate, 10) || 0;
        }
        
        // Update preorders
        await client.query(
          `UPDATE coexistence.meenzy_preorders
           SET delivery_date = CURRENT_DATE + $1::integer,
               delivery_time = $2,
               order_status = CASE WHEN order_status = 'AWAITING_DELIVERY_PREF' THEN 'CONFIRMED' ELSE order_status END
           WHERE customer_phone = $3 AND order_status IN ('AWAITING_DELIVERY_PREF', 'pending_market')`,
          [dateOffset, deliveryTime, whatsappId]
        );
        
        // Finalize cart
        await client.query(
          `UPDATE coexistence.meenzy_carts 
           SET status = 'converted', current_state = 'COMPLETED', updated_at = NOW() 
           WHERE whatsapp_id = $1 AND status = 'active'`, 
          [whatsappId]
        );
        
        await client.query('COMMIT');
        
        // Send final message
        const finalMsg = `✅ *Schedule Confirmed!*\n\nYour order is scheduled for delivery *${deliveryDate}, ${deliveryTime}*. We'll notify you when it's out for delivery!`;
        const { insertPendingRow } = require('../services/messageSender');
        const { enqueueSend } = require('../queue/sendQueue');
        const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: finalMsg });
        await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: finalMsg, previewUrl: false } });
        
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('[cartManager] Delivery Setup Error:', e.message);
      } finally {
        client.release();
      }
    }
    return true;
  }

  // Categories / Products (Simulating Browsing)
  if (incomingPayload.startsWith('order_')) {
    const productId = incomingPayload.replace('order_', '');
    await updateCartState(whatsappId, 'ITEM_SELECTED', { selected_item: productId });
    await sendQuantityPicker(whatsappId, account, productId);
    return true; // handled
  }

  // Adding item to cart
  if (incomingPayload.startsWith('C_ADD:')) {
    const parts = incomingPayload.split(':'); // C_ADD:productId:qty
    if (parts.length === 3) {
      const productId = parts[1];
      const qty = parseFloat(parts[2]);
      await addItemToCart(whatsappId, productId, qty);
      await updateCartState(whatsappId, 'CART_REVIEW');
      await sendCartSummary(whatsappId, account);
    }
    return true;
  }
  
  // Resuming Cart
  if (incomingPayload === 'C_RESUME') {
    await sendCartSummary(whatsappId, account);
    return true;
  }

  return false; // not handled by cart state machine
}


async function handleFreeformText(whatsappId, account, text) {
  const cart = await getOrCreateCart(whatsappId);
  if (cart.current_state === 'ITEM_SELECTED' || cart.current_state === 'CART_REVIEW') {
    // If they typed something like "I want it cleaned well", save it to context
    const context = cart.state_context || {};
    context.special_instructions = (context.special_instructions || '') + ' ' + text;
    
    await pool.query(`
      UPDATE coexistence.meenzy_carts 
      SET state_context = $1, updated_at = NOW()
      WHERE whatsapp_id = $2 AND status = 'active'
    `, [JSON.stringify(context), whatsappId]);

    const reply = "Got it! We'll make sure to follow your instructions: '" + text + "'. Please select your quantity below to continue:";
    const { insertPendingRow } = require('../services/messageSender');
    const { enqueueSend } = require('../queue/sendQueue');
    
    const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: reply });
    await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: reply, previewUrl: false } });
    
    if (cart.current_state === 'ITEM_SELECTED' && context.selected_item) {
      await sendQuantityPicker(whatsappId, account, context.selected_item);
    } else if (cart.current_state === 'CART_REVIEW') {
      await sendCartSummary(whatsappId, account);
    }
    return true;
  }
  return false;
}

module.exports = {
  handleCartState,
  getOrCreateCart,
  handleFreeformText
};

