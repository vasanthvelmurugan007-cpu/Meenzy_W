const pool = require('../db');
const { insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');
const { getAllMatchesForExtractedItem } = require('../catalogParser');
const { createPaymentLink } = require('../services/razorpayService');

// Advanced Native checkout implementation

async function startNativeOrderFlow(whatsappId, account, items) {
  if (!items || items.length === 0) return;
  const requestedItem = items[0].item;
  
  const matches = getAllMatchesForExtractedItem(requestedItem);
  if (matches.length === 0) {
    const text = `Sorry, we couldn't find any exact matches for *${requestedItem}* in our catalog today. Please check our website https://www.meenzy.in`;
    const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: text });
    await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: true } });
    return;
  }
  
  // Create state context
  const stateContext = {
    searchQuery: requestedItem,
    matches: matches,
    selectedProduct: null,
    selectedCut: null,
    selectedQty: null
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO coexistence.meenzy_carts (whatsapp_id, current_state, state_context, status, cart_items, updated_at)
      VALUES ($1, 'AWAITING_PRODUCT', $2, 'active', '[]'::jsonb, now())
      ON CONFLICT (whatsapp_id) 
      DO UPDATE SET 
        current_state = 'AWAITING_PRODUCT', 
        state_context = $2,
        status = 'active',
        cart_items = '[]'::jsonb,
        updated_at = now()
    `, [whatsappId, JSON.stringify(stateContext)]);
    await client.query('COMMIT');
    
    // If only 1 match, auto-select it and skip to variants/quantity
    if (matches.length === 1) {
       await handleProductSelection(whatsappId, account, 0);
       return;
    }

    // Send List Message for multiple matches
    const rows = matches.slice(0, 10).map((m, idx) => ({
      id: `C_PROD:${idx}`,
      title: m.name.substring(0, 24),
      description: `₹${m.pricePerKg}`.substring(0, 72)
    }));
    
    const payload = {
      type: "list",
      header: { type: "text", text: `🐟 Select Product` },
      body: { text: `We found a few options for *${requestedItem}*. Please pick one:` },
      action: { button: "Options", sections: [{ title: "Available Items", rows }] }
    };
    
    const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'interactive', messageBody: 'Select Product' });
    await enqueueSend({ kind: 'interactive', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { interactive: payload } });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[nativeOrderEngine] start Error:', err);
  } finally {
    client.release();
  }
}

async function handleProductSelection(whatsappId, account, matchIndex) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT state_context FROM coexistence.meenzy_carts WHERE whatsapp_id = $1 AND status = 'active'`, [whatsappId]);
    if (rows.length === 0) return;
    
    const context = rows[0].state_context;
    const selectedProduct = context.matches[matchIndex];
    if (!selectedProduct) return;
    
    context.selectedProduct = selectedProduct;
    
    // Check if it has cuts
    if (selectedProduct.cutOptions && selectedProduct.cutOptions.length > 0) {
      await client.query(`UPDATE coexistence.meenzy_carts SET current_state = 'AWAITING_VARIANTS', state_context = $1, updated_at = now() WHERE whatsapp_id = $2`, [JSON.stringify(context), whatsappId]);
      await askForCut(whatsappId, account, selectedProduct);
    } else {
      await client.query(`UPDATE coexistence.meenzy_carts SET current_state = 'AWAITING_QUANTITY', state_context = $1, updated_at = now() WHERE whatsapp_id = $2`, [JSON.stringify(context), whatsappId]);
      await askForQuantity(whatsappId, account, selectedProduct);
    }
  } finally {
    client.release();
  }
}

async function askForCut(whatsappId, account, item) {
  const text = `🐟 *${item.name}*\n\nPlease select how you want this cut:`;
  const buttons = item.cutOptions.slice(0, 3).map((cut, idx) => ({
    type: "reply",
    reply: { id: `C_CUT:${idx}`, title: cut.substring(0, 20) }
  }));

  const payload = { type: "button", body: { text }, action: { buttons } };
  
  if (item.imageUrl) {
    payload.header = { type: "image", image: { link: item.imageUrl } };
  }

  const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'interactive', messageBody: 'Select Cut' });
  await enqueueSend({ kind: 'interactive', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { interactive: payload } });
}

async function handleCutSelection(whatsappId, account, cutIndex) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT state_context FROM coexistence.meenzy_carts WHERE whatsapp_id = $1 AND status = 'active'`, [whatsappId]);
    if (rows.length === 0) return;
    
    const context = rows[0].state_context;
    const selectedProduct = context.selectedProduct;
    if (!selectedProduct) return;
    
    context.selectedCut = selectedProduct.cutOptions[cutIndex];
    
    await client.query(`UPDATE coexistence.meenzy_carts SET current_state = 'AWAITING_QUANTITY', state_context = $1, updated_at = now() WHERE whatsapp_id = $2`, [JSON.stringify(context), whatsappId]);
    await askForQuantity(whatsappId, account, selectedProduct);
  } finally {
    client.release();
  }
}

async function askForQuantity(whatsappId, account, item) {
  const text = `⚖️ Please select the quantity for *${item.name}*:`;
  const buttons = [
    { type: "reply", reply: { id: `C_QTY:0.5`, title: "0.5 Kg" } },
    { type: "reply", reply: { id: `C_QTY:1`, title: "1 Kg" } },
    { type: "reply", reply: { id: `C_QTY:2`, title: "2 Kg" } }
  ];

  const payload = { type: "button", body: { text }, action: { buttons } };
  
  const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'interactive', messageBody: 'Select Quantity' });
  await enqueueSend({ kind: 'interactive', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { interactive: payload } });
}

async function handleQuantitySelection(whatsappId, account, qty) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT state_context FROM coexistence.meenzy_carts WHERE whatsapp_id = $1 AND status = 'active'`, [whatsappId]);
    if (rows.length === 0) return;
    
    const context = rows[0].state_context;
    context.selectedQty = parseFloat(qty) || 1;
    
    // Add to cart_items format to retain compatibility with CART_REVIEW
    const cartItem = {
      name: context.selectedProduct.name,
      qty: context.selectedQty,
      pricePerKg: context.selectedProduct.pricePerKg,
      selectedCut: context.selectedCut
    };
    context.items = [cartItem];

    await client.query(`UPDATE coexistence.meenzy_carts SET current_state = 'CART_REVIEW', state_context = $1, updated_at = now() WHERE whatsapp_id = $2`, [JSON.stringify(context), whatsappId]);
    await sendCartSummaryAndAskAddress(whatsappId, account, context);
  } finally {
    client.release();
  }
}

async function sendCartSummaryAndAskAddress(whatsappId, account, context) {
  const items = context.items || [];
  let total = 0;
  let summaryText = '🛒 *Cart Summary*\n';
  
  for (const item of items) {
    const itemTotal = item.qty * item.pricePerKg;
    total += itemTotal;
    const cutStr = item.selectedCut ? ` (${item.selectedCut})` : '';
    summaryText += `- ${item.qty}kg ${item.name}${cutStr} : ₹${itemTotal}\n`;
  }
  
  summaryText += `\n*Total: ₹${total}*\n\nPlease reply with your full delivery address to proceed.`;
  
  const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: 'Cart Summary' });
  await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: summaryText, previewUrl: false } });
}

async function askForPaymentMethod(whatsappId, account) {
  const text = `How would you like to pay?`;
  const buttons = [
    { type: "reply", reply: { id: "PAY_ONLINE", title: "Pay Online Now" } },
    { type: "reply", reply: { id: "PAY_COD", title: "Cash on Delivery" } }
  ];

  const payload = {
    type: "button",
    body: { text },
    action: { buttons }
  };

  const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'interactive', messageBody: 'Payment Method' });
  await enqueueSend({ kind: 'interactive', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { interactive: payload } });
}

async function finalizeCODOrder(whatsappId, account, context) {
  const items = context.items || [];
  const address = context.address;
  let totalAmount = 0;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    for (const item of items) {
      totalAmount += item.qty * item.pricePerKg;
      const cutText = item.selectedCut ? ` (${item.selectedCut})` : '';
      const itemName = `${item.name}${cutText}`;
      
      try {
        await client.query('SAVEPOINT check_col');
        await client.query(`
          INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status, address_line, payment_status)
          VALUES ($1, $2, $3, 'pending_market', $4, 'COD')
        `, [whatsappId, itemName, item.qty, address]);
        await client.query('RELEASE SAVEPOINT check_col');
      } catch (insertErr) {
        await client.query('ROLLBACK TO SAVEPOINT check_col');
        if (insertErr.code === '42703') { // undefined_column
          await client.query(`
            INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status, address_line)
            VALUES ($1, $2, $3, 'pending_market', $4)
          `, [whatsappId, itemName, item.qty, address]);
        } else {
          throw insertErr;
        }
      }
    }

    const orderItemsJson = JSON.stringify(items.map(i => ({
      product_id: i.name,
      name: i.name,
      quantity: i.qty,
      price: i.pricePerKg,
      cut: i.selectedCut
    })));

    const { geocodeAddress } = require('../services/geocoder');
    const geo = await geocodeAddress(address);
    const lat = geo ? geo.lat : null;
    const lng = geo ? geo.lng : null;

    try {
      await client.query('SAVEPOINT check_eco');
      await client.query(`
        INSERT INTO coexistence.ecosystem_orders 
        (user_phone, total_price, status, payment_status, source, address_line, order_items, lat, lng)
        VALUES ($1, $2, 'CREATED', 'COD', 'WHATSAPP_NATIVE', $3, $4::jsonb, $5, $6)
      `, [whatsappId, totalAmount, address, orderItemsJson, lat, lng]);
      await client.query('RELEASE SAVEPOINT check_eco');
    } catch (ecoErr) {
      await client.query('ROLLBACK TO SAVEPOINT check_eco');
      if (ecoErr.code === '42703') { // undefined_column
        await client.query(`
          INSERT INTO coexistence.ecosystem_orders 
          (user_phone, total_price, status, address_line, lat, lng)
          VALUES ($1, $2, 'CREATED', $3, $4, $5)
        `, [whatsappId, totalAmount, address, lat, lng]);
      } else {
        throw ecoErr;
      }
    }

    await client.query(`
      UPDATE coexistence.meenzy_carts 
      SET current_state = 'CHECKOUT', status = 'converted', updated_at = NOW()
      WHERE whatsapp_id = $1 AND current_state = 'CART_REVIEW' AND status = 'active'
    `, [whatsappId]);

    await client.query('COMMIT');

    const successMsg = `🎉 *Order Registered!*\n\nSince we take pre-orders, your Cash on Delivery order has been registered for delivery to:\n_${address}_\n\nAmount to pay on delivery: ₹${totalAmount}\n\nYou will receive a confirmation message once your order is confirmed by our team. Thank you for choosing Meenzy Fresh Seafood! 🐟`;
    const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: successMsg });
    await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: successMsg, previewUrl: false } });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[nativeOrderEngine] DB Error saving COD order:', err);
  } finally {
    client.release();
  }
}

async function generatePaymentLinkAndSend(whatsappId, account, context) {
  const items = context.items || [];
  let total = 0;
  for (const item of items) {
    total += item.qty * item.pricePerKg;
  }
  
  const orderId = `ORD_${Date.now()}`;
  
  const paymentResult = await createPaymentLink({
    amount: total,
    phone: String(whatsappId).replace(/\D/g, ''),
    description: 'Meenzy Fresh Seafood Order',
    referenceId: orderId
  });
  
  if (paymentResult.ok) {
    context.paymentLinkId = paymentResult.id;
    const client = await pool.connect();
    try {
      await client.query(`UPDATE coexistence.meenzy_carts SET state_context = $1 WHERE whatsapp_id = $2 AND status = 'active'`, [JSON.stringify(context), whatsappId]);
    } finally {
      client.release();
    }
    
    const msg = `🧾 *Payment Details*\nAmount to pay: ₹${total}\n\nPlease click the secure Razorpay link below to complete your payment:\n🔗 ${paymentResult.short_url}\n\n_Your order will be instantly confirmed once paid!_`;
    const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: 'Payment Link' });
    await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: msg, previewUrl: true } });
  } else {
    const errorMsg = `❌ Sorry, we couldn't generate a payment link at the moment.\n\nError: ${paymentResult.error}\n\nPlease try again later.`;
    const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: 'Payment Error' });
    await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: errorMsg, previewUrl: false } });
  }
}

async function handleNativeInteraction(whatsappId, account, cart, incomingPayload, incomingText) {
  const context = cart.state_context || {};

  if (cart.current_state === 'AWAITING_PRODUCT' && incomingPayload && incomingPayload.startsWith('C_PROD:')) {
    const idx = parseInt(incomingPayload.split(':')[1], 10);
    await handleProductSelection(whatsappId, account, idx);
    return true;
  }

  if (cart.current_state === 'AWAITING_VARIANTS' && incomingPayload && incomingPayload.startsWith('C_CUT:')) {
    const idx = parseInt(incomingPayload.split(':')[1], 10);
    await handleCutSelection(whatsappId, account, idx);
    return true;
  }
  
  if (cart.current_state === 'AWAITING_QUANTITY' && incomingPayload && incomingPayload.startsWith('C_QTY:')) {
    const qty = incomingPayload.split(':')[1];
    await handleQuantitySelection(whatsappId, account, qty);
    return true;
  }

  if (cart.current_state === 'CART_REVIEW') {
    if (incomingText && incomingText.trim().length > 5) {
      context.address = incomingText.trim();
      const client = await pool.connect();
      try {
        await client.query(`UPDATE coexistence.meenzy_carts SET current_state = 'AWAITING_PAYMENT', state_context = $1 WHERE whatsapp_id = $2 AND status = 'active'`, [JSON.stringify(context), whatsappId]);
      } finally {
        client.release();
      }
      await generatePaymentLinkAndSend(whatsappId, account, context);
      return true;
    }
  }

  return false;
}

module.exports = {
  startNativeOrderFlow,
  handleProductSelection,
  handleCutSelection,
  handleQuantitySelection,
  handleNativeInteraction,
  handleRazorpayWebhook
};
