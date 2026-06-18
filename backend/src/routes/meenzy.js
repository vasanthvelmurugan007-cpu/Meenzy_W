const { Router } = require('express');
const pool = require('../db');
const { resolveAccount, insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');
const { getSingleAccount } = require('./whatsappAccounts');

const router = Router();

// Helper function to send outbound WhatsApp text messages directly to Meta Cloud API v20.0
async function sendMetaTextMessage(toNumber, text) {
  try {
    const account = await getSingleAccount();
    if (!account || !account.accessToken || !account.phoneNumberId) {
      console.error('[meenzy-send] Active WhatsApp account details not found.');
      return null;
    }
    
    const version = 'v20.0';
    const endpoint = `https://graph.facebook.com/${version}/${account.phoneNumberId}/messages`;
    
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: String(toNumber).replace(/\D/g, ''),
      type: 'text',
      text: { body: text }
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const resText = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(resText); } catch {}

    if (!res.ok) {
      console.error(`[meenzy-send] Meta API error (HTTP ${res.status}):`, parsed?.error?.message || resText);
      return null;
    }

    // Log to chat_history
    const wamid = parsed?.messages?.[0]?.id || `local-text-${Date.now()}`;
    await pool.query(
      `INSERT INTO coexistence.chat_history 
       (message_id, phone_number_id, wa_number, contact_number, to_number, direction, message_type, message_body, status, timestamp)
       VALUES ($1, $2, $3, $4, $5, 'outgoing', 'text', $6, $7, NOW())
       ON CONFLICT (message_id) DO NOTHING`,
      [
        wamid,
        account.phoneNumberId,
        account.displayPhoneNumber.replace(/\D/g, ''),
        String(toNumber).replace(/\D/g, ''),
        String(toNumber).replace(/\D/g, ''),
        text,
        'sent'
      ]
    );

    return parsed;
  } catch (err) {
    console.error('[meenzy-send] Exception sending Meta message:', err.message);
    return null;
  }
}

/**
 * Process inbound order/cart from Meta webhook
 */
async function processCheckout(customerPhone, cartItems, catalogId) {
  const { fetchCatalogProducts } = require('./webhook');
  
  try {
    console.log(`[meenzy-checkout] Processing checkout for customer ${customerPhone}`);
    // 1. Fetch live Wix products
    const wixProducts = await fetchCatalogProducts();
    
    const finalizedItems = [];
    
    // 2. Cross-reference against Wix products to verify baseline availability & real prices
    for (const item of cartItems) {
      const product = wixProducts.find(p => p.retailer_id === item.product_retailer_id || p.id === item.product_retailer_id);
      if (!product) {
        console.warn(`[meenzy-checkout] Item ${item.product_retailer_id} not found in Wix feed. Skipping.`);
        continue;
      }
      
      const price = parseFloat(product.price || 0);
      const qty = parseFloat(item.quantity || 0);
      
      finalizedItems.push({
        name: product.name,
        qty: qty,
        price: price
      });
    }
    
    if (finalizedItems.length === 0) {
      console.error(`[meenzy-checkout] No valid items found in checkout for customer ${customerPhone}`);
      return;
    }
    
    // 3. Insert into meenzy_preorders table forcing status to 'pending_market'
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of finalizedItems) {
        await client.query(
          `INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status)
           VALUES ($1, $2, $3, 'pending_market')`,
          [customerPhone, item.name, item.qty]
        );
      }
      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }
    
    console.log(`[meenzy-checkout] Logged ${finalizedItems.length} items for customer ${customerPhone} with status 'pending_market'`);
    
    // 4. Immediately fire outbound warning message back to customer
    const warningMsg = "Thank you for your pre-order! 🌊 We have received your request. Because we source our seafood fresh daily, we will verify availability when the morning catch lands at the market and send your formal confirmation and bill by 7:30 AM tomorrow!";
    await sendMetaTextMessage(customerPhone, warningMsg);
    
    // 5. Send Delivery Schedule Request
    console.log(`[meenzy-checkout] Fetching account for delivery schedule...`);
    const account = await getSingleAccount();
    console.log(`[meenzy-checkout] Account fetched:`, account ? account.id : 'null');
    if (account) {
      console.log(`[meenzy-checkout] Building delivery payload...`);
      const { getDeliveryPayload } = require('../services/deliveryScheduler');
      const deliveryPayload = getDeliveryPayload();
      
      console.log(`[meenzy-checkout] Calling insertPendingRow...`);
      const localId = await insertPendingRow({ 
        account, 
        toNumber: customerPhone, 
        messageType: 'interactive', 
        messageBody: 'Request Delivery Schedule' 
      });
      console.log(`[meenzy-checkout] insertPendingRow finished, localId:`, localId);
      
      console.log(`[meenzy-checkout] Calling enqueueSend...`);
      await enqueueSend({ 
        kind: 'interactive', 
        accountId: account.id, 
        to: String(customerPhone).replace(/\D/g, ''), 
        localMessageId: localId, 
        payload: { interactive: deliveryPayload } 
      });
      console.log(`[meenzy-checkout] enqueueSend finished!`);
    }
  } catch (err) {
    console.error('[meenzy-checkout] Error in processCheckout:', err.message);
  }
}

/**
 * Confirm a preorder based on catch availability
 */
async function confirmOrder(orderId, trackingNumber = null) {
  try {
    // 1. Fetch preorder details
    const orderRes = await pool.query(
      `SELECT customer_phone, ordered_item, quantity, driver_id, address_line FROM coexistence.meenzy_preorders WHERE id = $1`,
      [orderId]
    );
    if (orderRes.rows.length === 0) {
      throw new Error(`Order with ID ${orderId} not found`);
    }
    const order = orderRes.rows[0];
    
    // 2. Fetch live Wix products to calculate the correct price
    const { fetchCatalogProducts } = require('./webhook');
    const wixProducts = await fetchCatalogProducts();
    const product = wixProducts.find(p => p.name === order.ordered_item);
    const price = product ? parseFloat(product.price || 0) : 0;
    const total = price * parseFloat(order.quantity);

    // 3. Update meenzy_preorders status
    await pool.query(
      `UPDATE coexistence.meenzy_preorders SET order_status = 'confirmed' WHERE id = $1`,
      [orderId]
    );

    // 4. Create or update ecosystem_orders so it appears in Deliveries
    let ecosystemOrderId;
    let wixOrderId;
    const existingOrderRes = await pool.query(`
      SELECT o.id, o.wix_order_id
      FROM coexistence.ecosystem_orders o
      JOIN coexistence.ecosystem_order_items i ON o.id = i.order_id
      WHERE RIGHT(regexp_replace(o.user_phone, '\\D', '', 'g'), 10) = RIGHT($1, 10) AND i.product_name ILIKE $2
      ORDER BY o.created_at DESC LIMIT 1
    `, [String(order.customer_phone).replace(/\D/g, ''), `%${order.ordered_item}%`]);

    if (existingOrderRes.rows.length > 0) {
      ecosystemOrderId = existingOrderRes.rows[0].id;
      wixOrderId = existingOrderRes.rows[0].wix_order_id || ecosystemOrderId;
      
      const { rows: currentEco } = await pool.query(
        `SELECT address_line, lat, lng FROM coexistence.ecosystem_orders WHERE id = $1`,
        [ecosystemOrderId]
      );
      
      const updateFields = [];
      const updateParams = [];
      let paramIdx = 1;

      if (order.driver_id) {
        updateFields.push(`assigned_agent_id = $${paramIdx++}`);
        updateParams.push(order.driver_id);
      }

      const currentAddress = currentEco[0]?.address_line;
      if ((!currentAddress || currentAddress === 'WhatsApp Preorder') && order.address_line) {
        updateFields.push(`address_line = $${paramIdx++}`);
        updateParams.push(order.address_line);

        const { geocodeAddress } = require('../services/geocoder');
        const geo = await geocodeAddress(order.address_line);
        if (geo) {
          updateFields.push(`lat = $${paramIdx++}`);
          updateParams.push(geo.lat);
          updateFields.push(`lng = $${paramIdx++}`);
          updateParams.push(geo.lng);
        }
      }

      if (updateFields.length > 0) {
        updateParams.push(ecosystemOrderId);
        await pool.query(
          `UPDATE coexistence.ecosystem_orders SET ${updateFields.join(', ')} WHERE id = $${paramIdx}`,
          updateParams
        );
      }
    } else {
      const addressToUse = order.address_line || 'WhatsApp Preorder';
      const { geocodeAddress } = require('../services/geocoder');
      const geo = await geocodeAddress(addressToUse);
      const lat = geo ? geo.lat : null;
      const lng = geo ? geo.lng : null;

      const stubOrderRes = await pool.query(`
        INSERT INTO coexistence.ecosystem_orders (user_phone, total_price, status, address_line, assigned_agent_id, lat, lng)
        VALUES ($1, $2, 'CREATED', $3, $4, $5, $6)
        RETURNING id, id as wix_order_id
      `, [String(order.customer_phone).replace(/\D/g, ''), total, addressToUse, order.driver_id || null, lat, lng]);
      
      ecosystemOrderId = stubOrderRes.rows[0].id;
      wixOrderId = stubOrderRes.rows[0].wix_order_id;
      
      await pool.query(`
        INSERT INTO coexistence.ecosystem_order_items (order_id, product_name, quantity, price)
        VALUES ($1, $2, $3, $4)
      `, [ecosystemOrderId, order.ordered_item, order.quantity, price]);
    }

    // 5. Generate OTP and save to ecosystem_orders (tracking page uses this)
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    await pool.query(`UPDATE coexistence.ecosystem_orders SET delivery_otp = $1 WHERE id = $2`, [otp, ecosystemOrderId]);
    // Also save backward compatible OTP to preorder
    await pool.query(`UPDATE coexistence.meenzy_preorders SET otp = $1 WHERE id = $2`, [otp, orderId]);
    
    const receiptSummary = `${order.ordered_item} (${order.quantity} Kg) - ₹${price}/Kg | Total: ₹${total}`;
    const trackingId = trackingNumber || wixOrderId.split('-')[0].slice(0, 8);
    
    // 6. Send Meta API template message
    const account = await getSingleAccount();
    if (!account || !account.accessToken || !account.phoneNumberId) {
      throw new Error('Active WhatsApp account details not found.');
    }
    
    const version = 'v20.0';
    const endpoint = `https://graph.facebook.com/${version}/${account.phoneNumberId}/messages`;
    
    const templatePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: String(order.customer_phone).replace(/\D/g, ''),
      type: 'template',
      template: {
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
    };
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(templatePayload)
    });
    
    const resText = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(resText); } catch {}
    
    if (!res.ok) {
      throw new Error(`Meta API error (HTTP ${res.status}): ${parsed?.error?.message || resText}`);
    }
    
    // Log template in chat_history
    const wamid = parsed?.messages?.[0]?.id || `local-confirm-${Date.now()}`;
    await pool.query(
      `INSERT INTO coexistence.chat_history 
       (message_id, phone_number_id, wa_number, contact_number, to_number, direction, message_type, message_body, status, timestamp)
       VALUES ($1, $2, $3, $4, $5, 'outgoing', 'template', $6, $7, NOW())
       ON CONFLICT (message_id) DO NOTHING`,
      [
        wamid,
        account.phoneNumberId,
        account.displayPhoneNumber.replace(/\D/g, ''),
        String(order.customer_phone).replace(/\D/g, ''),
        String(order.customer_phone).replace(/\D/g, ''),
        `Order confirmed. Receipt: ${receiptSummary}. Tracking: ${trackingId}`,
        'sent'
      ]
    );

    // 7. Send Follow-up Text Message with OTP and Tracking Link
    const trackingPhone = String(order.customer_phone).replace(/\D/g, '').slice(-4);
    const trackingLink = `${process.env.CORS_ORIGIN || 'https://meenzy-frontend.onrender.com'}/#/track/${ecosystemOrderId}?phone=${trackingPhone}`;
    const otpMsg = `🔒 *Your Delivery OTP:* ${otp}\n\n📍 *Track your order live here:*\n${trackingLink}\n\nPlease share this OTP with the delivery agent when they arrive!`;
    await sendMetaTextMessage(order.customer_phone, otpMsg);
    
    return { ok: true, wamid, receiptSummary, trackingId, otp };
  } catch (err) {
    console.error(`[meenzy-confirm] Error confirming order ${orderId}:`, err.message);
    throw err;
  }
}

/**
 * Cancel a preorder because of unavailability
 */
async function cancelOrder(orderId) {
  try {
    // 1. Fetch preorder details
    const orderRes = await pool.query(
      `SELECT customer_phone, ordered_item, quantity FROM coexistence.meenzy_preorders WHERE id = $1`,
      [orderId]
    );
    if (orderRes.rows.length === 0) {
      throw new Error(`Order with ID ${orderId} not found`);
    }
    const order = orderRes.rows[0];
    
    // 2. Update status to 'cancelled'
    await pool.query(
      `UPDATE coexistence.meenzy_preorders SET order_status = 'cancelled' WHERE id = $1`,
      [orderId]
    );
    
    // 3. Send Meta API text message with cancellation message and options
    const cancellationText = `We are sorry, but the fresh catch you ordered (${order.ordered_item}) is unavailable today. We expect it back soon, or you can choose from other fresh options like Pomfret, White Prawns, or Rohu!`;
    await sendMetaTextMessage(order.customer_phone, cancellationText);
    
    return { ok: true };
  } catch (err) {
    console.error(`[meenzy-cancel] Error cancelling order ${orderId}:`, err.message);
    throw err;
  }
}

/**
 * GET /api/meenzy/preorders
 * Fetch all preorders sorted by created_at desc.
 */
router.get('/meenzy/preorders', async (req, res) => {
  try {
    const preorders = await pool.query(
      `SELECT * FROM coexistence.meenzy_preorders ORDER BY created_at DESC`
    );
    res.json(preorders.rows);
  } catch (err) {
    console.error('[meenzy-get-preorders] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/meenzy/preorders/:id
 * Delete a preorder by its id.
 */
router.delete('/meenzy/preorders/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM coexistence.meenzy_preorders WHERE id = $1`,
      [id]
    );
    res.json({ ok: true, deleted: rowCount });
  } catch (err) {
    console.error('[meenzy-delete-preorder] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/meenzy/preorders/:id/assign
 * Assign a driver to a preorder.
 */
router.put('/meenzy/preorders/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { driver_id } = req.body;
  try {
    // 1. Fetch preorder customer phone and item to match ecosystem order
    const preRes = await pool.query(
      `SELECT customer_phone, ordered_item FROM coexistence.meenzy_preorders WHERE id = $1`,
      [id]
    );

    // 2. Update preorder driver_id
    const { rowCount } = await pool.query(
      `UPDATE coexistence.meenzy_preorders SET driver_id = $1 WHERE id = $2`,
      [driver_id || null, id]
    );

    // 3. Sync driver assignment to the corresponding ecosystem order
    if (preRes.rows.length > 0) {
      const preorder = preRes.rows[0];
      try {
        const ecosystemOrderRes = await pool.query(`
          SELECT o.id
          FROM coexistence.ecosystem_orders o
          JOIN coexistence.ecosystem_order_items i ON o.id = i.order_id
          WHERE RIGHT(regexp_replace(o.user_phone, '\\D', '', 'g'), 10) = RIGHT($1, 10) AND i.product_name ILIKE $2
          ORDER BY o.created_at DESC LIMIT 1
        `, [String(preorder.customer_phone).replace(/\D/g, ''), `%${preorder.ordered_item}%`]);

        if (ecosystemOrderRes.rows.length > 0) {
          await pool.query(
            `UPDATE coexistence.ecosystem_orders SET assigned_agent_id = $1 WHERE id = $2`,
            [driver_id || null, ecosystemOrderRes.rows[0].id]
          );
        }
      } catch (syncErr) {
        console.error('[meenzy-assign-preorder] Sync error:', syncErr.message);
      }
    }

    res.json({ ok: true, updated: rowCount });
  } catch (err) {
    console.error('[meenzy-assign-preorder] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/meenzy/inventory-failure
 * Triggered by procurement manager when an item fails inspection or is out of stock.
 * Sends Interactive buttons to all impacted customers.
 */
router.post('/meenzy/inventory-failure', async (req, res) => {
  const { ordered_item } = req.body;
  if (!ordered_item) {
    return res.status(400).json({ error: 'ordered_item is required' });
  }

  try {
    // 1. Update all pending preorders for this item to AWAITING_FAILURE_SWAP and return the customer phones
    const preordersRes = await pool.query(
      `UPDATE coexistence.meenzy_preorders
       SET order_status = 'AWAITING_FAILURE_SWAP'
       WHERE ordered_item ILIKE $1 AND LOWER(order_status) IN ('pending_confirmation', 'pending_market', 'awaiting_delivery_pref', 'confirmed', 'pending_checkout')
       RETURNING customer_phone`,
      [`${ordered_item}%`]
    );

    // Get unique customers
    const customers = Array.from(new Set(preordersRes.rows.map(r => r.customer_phone)));
    if (customers.length === 0) {
      return res.json({ ok: true, message: `No pending preorders found for ${ordered_item}` });
    }

    // 2. Resolve default WhatsApp account
    const { account, error } = await resolveAccount({});
    if (error || !account) {
      return res.status(500).json({ error: `WhatsApp account resolution failed: ${error}` });
    }

    let alertCount = 0;
    for (const customer_phone of customers) {
      // Construct Meta Interactive Button payload
      const interactivePayload = {
        type: "button",
        body: { 
          text: `⚠️ *Meenzy Preorder Notice* ⚠️\n\nUnfortunately, *${ordered_item}* is not available in today's fresh hauls. Please select a resolution option:` 
        },
        action: {
          buttons: [
            { type: "reply", reply: { id: "option_1_refund", title: "Refund 💵" } },
            { type: "reply", reply: { id: "option_2_swap", title: "Swap Fish 🐟" } },
            { type: "reply", reply: { id: "option_3_postpone", title: "Postpone ⏳" } }
          ]
        }
      };

      // Create optimistic chat_history row
      const localId = await insertPendingRow({
        account,
        toNumber: customer_phone,
        messageType: 'interactive',
        messageBody: `⚠️ Meenzy Preorder Notice ⚠️: Unfortunately, ${ordered_item} is not available...`,
      });

      // Enqueue standard outbound send queue job
      await enqueueSend({
        kind: 'interactive',
        accountId: account.id,
        to: String(customer_phone).replace(/\D/g, ''),
        localMessageId: localId,
        payload: { interactive: interactivePayload },
      });

      alertCount++;
    }

    res.json({ ok: true, alerted_customers: alertCount });
  } catch (err) {
    console.error('[meenzy-failure-alert] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/meenzy/inventory-confirm
 * Triggered by procurement manager when an item passes inspection and is secured.
 * Sends confirmation message to all impacted customers.
 */
router.post('/meenzy/inventory-confirm', async (req, res) => {
  const { ordered_item } = req.body;
  if (!ordered_item) {
    return res.status(400).json({ error: 'ordered_item is required' });
  }

  try {
    // 1. Update all pending preorders for this item to confirmed and return the customer phones
    const preordersRes = await pool.query(
      `UPDATE coexistence.meenzy_preorders
       SET order_status = 'confirmed'
       WHERE ordered_item ILIKE $1 AND LOWER(order_status) IN ('pending_confirmation', 'pending_market', 'awaiting_delivery_pref', 'confirmed', 'pending_checkout')
       RETURNING customer_phone`,
      [`${ordered_item}%`]
    );

    // Get unique customers
    const customers = Array.from(new Set(preordersRes.rows.map(r => r.customer_phone)));
    if (customers.length === 0) {
      return res.json({ ok: true, message: `No pending preorders found for ${ordered_item}` });
    }

    // 2. Resolve default WhatsApp account
    const { account, error } = await resolveAccount({});
    if (error || !account) {
      return res.status(500).json({ error: `WhatsApp account resolution failed: ${error}` });
    }

    let alertCount = 0;
    for (const customer_phone of customers) {
      // Find the corresponding ecosystem order to get the tracking link and price
      const orderRes = await pool.query(`
        SELECT o.id, o.wix_order_id, o.total_price 
        FROM coexistence.ecosystem_orders o
        JOIN coexistence.ecosystem_order_items i ON o.id = i.order_id
        WHERE RIGHT(regexp_replace(o.user_phone, '\\D', '', 'g'), 10) = RIGHT($1, 10) AND i.product_name ILIKE $2
        ORDER BY o.created_at DESC LIMIT 1
      `, [String(customer_phone).replace(/\D/g, ''), `%${ordered_item}%`]);

      let messageText = `✅ Great news! Your preorder for *${ordered_item}* is secured from today's fresh catch! We will pack and deliver it to you shortly.`;

      let o;
      if (orderRes.rows.length > 0) {
        o = orderRes.rows[0];
      } else {
        // Find if preorder has a driver assigned
        const preRes = await pool.query(`
          SELECT driver_id FROM coexistence.meenzy_preorders
          WHERE customer_phone = $1 AND ordered_item ILIKE $2
          ORDER BY created_at DESC LIMIT 1
        `, [customer_phone, `%${ordered_item}%`]);
        const preorderDriverId = preRes.rows.length > 0 ? preRes.rows[0].driver_id : null;

        // Customer never went to Wix checkout, but we still need tracking and OTP! Auto-create ecosystem order.
        const stubOrderRes = await pool.query(`
          INSERT INTO coexistence.ecosystem_orders (user_phone, total_price, status, address_line, assigned_agent_id)
          VALUES ($1, 0, 'CREATED', 'WhatsApp Order', $2)
          RETURNING id, id as wix_order_id, total_price
        `, [String(customer_phone).replace(/\D/g, ''), preorderDriverId]);
        o = stubOrderRes.rows[0];
        
        await pool.query(`
          INSERT INTO coexistence.ecosystem_order_items (order_id, product_name, quantity, price)
          VALUES ($1, $2, 1, 0)
        `, [o.id, ordered_item]);
      }

      if (o) {
        const displayOrderId = o.wix_order_id || o.id;
        const trackingPhone = String(customer_phone).replace(/\D/g, '').slice(-4);
        const trackingLink = `${process.env.CORS_ORIGIN || 'https://meenzy-frontend.onrender.com'}/#/track/${o.id}?phone=${trackingPhone}`;
        
        // Generate OTP and save to ecosystem_orders & meenzy_preorders
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        await pool.query(`UPDATE coexistence.ecosystem_orders SET delivery_otp = $1 WHERE id = $2`, [otp, o.id]);
        await pool.query(`UPDATE coexistence.meenzy_preorders SET otp = $1 WHERE customer_phone = $2 AND ordered_item ILIKE $3`, [otp, customer_phone, `%${ordered_item}%`]);
        
        const receiptSummary = `${ordered_item} - Secured from catch | Total: ₹${o.total_price}`;
        const trackingId = String(displayOrderId).split('-')[0].slice(0, 8);
        const templateMsg = `Order confirmed. Receipt: ${receiptSummary}. Tracking: ${trackingId}`;

        // Create optimistic chat_history row for template
        const localId = await insertPendingRow({
          account,
          toNumber: customer_phone,
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

        // Enqueue template message
        await enqueueSend({
          kind: 'template',
          accountId: account.id,
          to: String(customer_phone).replace(/\D/g, ''),
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

        // Send a follow-up text with OTP and tracking link
        const otpMsg = `🔒 *Your Delivery OTP:* ${otp}\n\n📍 *Track your order live here:*\n${trackingLink}\n\nPlease share this OTP with the delivery agent when they arrive!`;
        await sendMetaTextMessage(customer_phone, otpMsg);
      }

      alertCount++;
    }

    res.json({ ok: true, alerted_customers: alertCount });
  } catch (err) {
    console.error('[meenzy-confirm-alert] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/meenzy/refunds
 * Fetch all refunds sorted by created_at desc.
 */
router.get('/meenzy/refunds', async (req, res) => {
  try {
    const refunds = await pool.query(
      `SELECT * FROM coexistence.meenzy_refunds ORDER BY created_at DESC`
    );
    res.json(refunds.rows);
  } catch (err) {
    console.error('[meenzy-get-refunds] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/meenzy/refunds/:id/status
 * Update refund status (e.g. COMPLETED or REJECTED)
 * 1-Click Credit Note / Refund auto-messaging logic
 */
router.post('/meenzy/refunds/:id/status', async (req, res) => {
  const { id } = req.params;
  const { refund_status } = req.body;
  if (!refund_status) {
    return res.status(400).json({ error: 'refund_status is required' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE coexistence.meenzy_refunds
       SET refund_status = $1
       WHERE id = $2
       RETURNING customer_phone, item_name, refund_amount`,
      [refund_status, id]
    );
    
    if (rows.length > 0 && refund_status === 'COMPLETED') {
      const refund = rows[0];
      const { resolveAccount, insertPendingRow } = require('../services/messageSender');
      const { enqueueSend } = require('../queue/sendQueue');
      const { account } = await resolveAccount({});
      
      if (account && refund.customer_phone) {
        const creditNoteCode = `CREDIT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const msgText = `✅ *Refund Processed!*\n\nYour refund of *₹${refund.refund_amount}* for ${refund.item_name} has been processed successfully!\n\nUse this 1-Click Credit Note / Coupon Code on your next order: *${creditNoteCode}*\n\nThank you for choosing Meenzy! 🐟`;
        
        const localId = await insertPendingRow({
          account,
          toNumber: refund.customer_phone,
          messageType: 'text',
          messageBody: msgText,
        });
        
        await enqueueSend({
          kind: 'text',
          accountId: account.id,
          to: String(refund.customer_phone).replace(/\D/g, ''),
          localMessageId: localId,
          payload: { body: msgText, previewUrl: false },
        });
      }
    }
    
    res.json({ ok: true, updated: rows.length });
  } catch (err) {
    console.error('[meenzy-update-refund] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/meenzy/trigger-broadcast
 * Manual trigger for the Catalog Broadcast (runs the exact same logic as 7:00 PM cron).
 */
router.post('/meenzy/trigger-broadcast', async (req, res) => {
  try {
    const { run7PmCatalogBroadcast } = require('../engine/automationEngine');
    await run7PmCatalogBroadcast();
    res.json({ ok: true, message: 'Broadcast triggered successfully.' });
  } catch (err) {
    console.error('[meenzy-manual-broadcast] Error:', err.message);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /api/admin/verify-catch
 * Triggered morning verification of catch. Handles unavailable items by offering swaps, postponements, or refunds.
 */
router.post('/admin/verify-catch', async (req, res) => {
  const { unavailable_id, replacements } = req.body;
  
  if (!unavailable_id || !replacements || !Array.isArray(replacements) || replacements.length !== 3) {
    return res.status(400).json({ error: 'unavailable_id and exactly three replacements are required' });
  }

  try {
    const { meenzySessions } = require('../engine/automationEngine');

    // 1. Fetch unavailable fish details from catalog
    const unavailableRes = await pool.query(
      'SELECT item_name, price_in_inr FROM coexistence.meenzy_catalog WHERE id = $1',
      [unavailable_id]
    );
    if (unavailableRes.rows.length === 0) {
      return res.status(404).json({ error: `Unavailable catalog item with ID ${unavailable_id} not found.` });
    }
    const { item_name: unavailableName, price_in_inr: unavailablePrice } = unavailableRes.rows[0];

    // 2. Fetch the 3 replacements
    const replacementsRes = await pool.query(
      'SELECT id, item_name, price_in_inr FROM coexistence.meenzy_catalog WHERE id = ANY($1::int[])',
      [replacements]
    );
    const replacementsData = replacementsRes.rows;
    if (replacementsData.length === 0) {
      return res.status(404).json({ error: 'No replacement items found.' });
    }

    // Ensure we maintain order of replacements as requested
    const sortedReplacements = replacements.map(id => replacementsData.find(r => r.id === id)).filter(Boolean);

    // 3. Find all matching PENDING_CONFIRMATION preorder entries
    const preordersRes = await pool.query(
      `SELECT * FROM coexistence.meenzy_preorders 
       WHERE order_status = 'PENDING_CONFIRMATION' AND ordered_item ILIKE $1`,
      [`${unavailableName}%`]
    );

    const preorders = preordersRes.rows;
    if (preorders.length === 0) {
      return res.json({ ok: true, message: `No pending preorders found for ${unavailableName}` });
    }

    const { account, error } = await resolveAccount({});
    if (error || !account) {
      return res.status(500).json({ error: `Failed to resolve WhatsApp account: ${error}` });
    }

    let affectedCount = 0;
    for (const preorder of preorders) {
      const customerPhone = preorder.customer_phone;
      const quantity = parseFloat(preorder.quantity);

      // Transition session state to AWAITING_FAILURE_SWAP and record replacement options
      meenzySessions[customerPhone] = {
        state: 'AWAITING_FAILURE_SWAP',
        preorderId: preorder.id,
        unavailableItemName: unavailableName,
        originalQuantity: quantity,
        originalItem: preorder.ordered_item,
        originalItemPrice: parseFloat(unavailablePrice) || 0,  // per-kg price of the OLD fish
        replacements: sortedReplacements
      };

      // Also update the preorder status in the database to AWAITING_FAILURE_SWAP
      await pool.query(
        `UPDATE coexistence.meenzy_preorders 
         SET order_status = 'AWAITING_FAILURE_SWAP' 
         WHERE id = $1`,
        [preorder.id]
      );

      // Build interactive dynamic option list rows
      const optionsRows = sortedReplacements.map((alt, idx) => {
        const calculatedTotal = quantity * alt.price_in_inr;
        return {
          id: `swap_alt_${idx + 1}`,
          title: `Swap: ${alt.item_name.substring(0, 18)}`,
          description: `Rate: ₹${alt.price_in_inr}/Kg | Total: ₹${calculatedTotal}`
        };
      });

      // Add Cancel & Refund and Postpone options
      optionsRows.push({
        id: "swap_cancel",
        title: "Cancel & Refund 💵",
        description: "Cancel preorder & receive full refund"
      });

      optionsRows.push({
        id: "swap_postpone",
        title: "Postpone Delivery ⏳",
        description: "Postpone catch delivery to tomorrow"
      });

      const listPayload = {
        type: "list",
        header: {
          type: "text",
          text: `⚠️ Preorder Action Required`
        },
        body: {
          text: `We are sorry! *${unavailableName}* is not available in today's fresh catches.\n\nPlease select one of the following dynamic resolution options for your order of *${quantity} Kg*:`
        },
        action: {
          button: "Resolve Order",
          sections: [
            {
              title: "Choose Resolution Path",
              rows: optionsRows
            }
          ]
        }
      };

      // Create optimistic chat_history row
      const localId = await insertPendingRow({
        account,
        toNumber: customerPhone,
        messageType: 'interactive',
        messageBody: `⚠️ Preorder Action Required: ${unavailableName} is unavailable. Please choose an alternative or cancel/postpone.`,
      });

      // Enqueue send
      await enqueueSend({
        kind: 'interactive',
        accountId: account.id,
        to: String(customerPhone).replace(/\D/g, ''),
        localMessageId: localId,
        payload: { interactive: listPayload },
      });

      affectedCount++;
    }

    res.json({ ok: true, affected_preorders: affectedCount });
  } catch (err) {
    console.error('[meenzy-verify-catch] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fulfillment manual verification endpoints
router.post('/meenzy/preorders/:id/confirm', async (req, res) => {
  const { id } = req.params;
  const { trackingNumber } = req.body;
  try {
    const result = await confirmOrder(id, trackingNumber);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/meenzy/preorders/:id/cancel', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await cancelOrder(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Bulk Quote Endpoints ---

router.get('/meenzy/bulk-quotes', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM coexistence.meenzy_bulk_quotes
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[bulk-quotes] Error fetching quotes:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/meenzy/bulk-quotes/:id/quote', async (req, res) => {
  const { id } = req.params;
  const { quoted_price } = req.body;
  if (!quoted_price) {
    return res.status(400).json({ error: 'quoted_price is required' });
  }

  try {
    const { rows } = await pool.query(`
      UPDATE coexistence.meenzy_bulk_quotes
      SET status = 'quoted', quoted_price = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [quoted_price, id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    const quote = rows[0];
    
    // Send WhatsApp Message
    const { resolveAccount, insertPendingRow } = require('../services/messageSender');
    const { enqueueSend } = require('../queue/sendQueue');
    const { account } = await resolveAccount({});
    
    if (account) {
      const msgText = `🎉 *Great news!* 🌊\n\nOur Procurement Manager has reviewed your bulk request for *${quote.quantity_kg}kg of ${quote.fish_name}* for your upcoming *${quote.occasion}*.\n\nWe can supply this freshly caught for a total custom price of *₹${quote.quoted_price}*!\n\nPlease reply *YES* to confirm and secure this order.`;
      
      const localId = await insertPendingRow({
        account,
        toNumber: quote.customer_phone,
        messageType: 'text',
        messageBody: msgText,
      });
      
      await enqueueSend({
        kind: 'text',
        accountId: account.id,
        to: String(quote.customer_phone).replace(/\D/g, ''),
        localMessageId: localId,
        payload: { body: msgText, previewUrl: false },
      });
    }

    res.json(quote);
  } catch (err) {
    console.error('[bulk-quotes] Error updating quote:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/meenzy/batch-agent/context
 * Fetches aggregated pending demand and catalog for the Morning Batch Agent UI.
 */
router.get('/meenzy/batch-agent/context', async (req, res) => {
  const { batch } = req.query;
  try {
    let timeFilter = '';
    if (batch === 'batch1') {
      timeFilter = ` AND (EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata') * 60 + EXTRACT(MINUTE FROM created_at AT TIME ZONE 'Asia/Kolkata')) >= 300 
                     AND (EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata') * 60 + EXTRACT(MINUTE FROM created_at AT TIME ZONE 'Asia/Kolkata')) <= 1435`;
    } else if (batch === 'batch2') {
      timeFilter = ` AND ((EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata') * 60 + EXTRACT(MINUTE FROM created_at AT TIME ZONE 'Asia/Kolkata')) < 300 
                     OR (EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata') * 60 + EXTRACT(MINUTE FROM created_at AT TIME ZONE 'Asia/Kolkata')) > 1435)`;
    }

    const demandRes = await pool.query(
      `SELECT ordered_item, SUM(quantity) as total_quantity 
       FROM coexistence.meenzy_preorders 
       WHERE LOWER(order_status) IN ('pending_confirmation', 'pending_checkout', 'pending_market')
       ${timeFilter}
       GROUP BY ordered_item
       ORDER BY total_quantity DESC`
    );

    const pendingDemand = demandRes.rows.map(row => ({
      item: row.ordered_item,
      quantity: parseFloat(row.total_quantity) || 0
    }));

    const { fetchCatalogProducts } = require('./webhook');
    const catalog = await fetchCatalogProducts();

    res.json({ ok: true, pendingDemand, catalog });
  } catch (err) {
    console.error('[batch-agent-context] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/meenzy/batch-agent/process
 * Week 1: Batch Agent
 * Replaces manual morning workflow by automatically resolving all PENDING_CONFIRMATION orders
 * based on the physical catch list (available items).
 */
router.post('/meenzy/batch-agent/process', async (req, res) => {
  const { availableInventory, unavailableItemsWithReplacements, batch } = req.body;
  if (!availableInventory || !unavailableItemsWithReplacements) {
    return res.status(400).json({ error: 'availableInventory and unavailableItemsWithReplacements are required' });
  }

  try {
    const { resolveAccount, insertPendingRow } = require('../services/messageSender');
    const { enqueueSend } = require('../queue/sendQueue');
    const { meenzySessions } = require('../engine/automationEngine');

    let timeFilter = '';
    if (batch === 'batch1') {
      timeFilter = ` AND (EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata') * 60 + EXTRACT(MINUTE FROM created_at AT TIME ZONE 'Asia/Kolkata')) >= 300 
                     AND (EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata') * 60 + EXTRACT(MINUTE FROM created_at AT TIME ZONE 'Asia/Kolkata')) <= 1435`;
    } else if (batch === 'batch2') {
      timeFilter = ` AND ((EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata') * 60 + EXTRACT(MINUTE FROM created_at AT TIME ZONE 'Asia/Kolkata')) < 300 
                     OR (EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata') * 60 + EXTRACT(MINUTE FROM created_at AT TIME ZONE 'Asia/Kolkata')) > 1435)`;
    }

    // Fetch all pending confirmations ordered by created_at ASC (first come, first served)
    const preordersRes = await pool.query(
      `SELECT * FROM coexistence.meenzy_preorders 
       WHERE LOWER(order_status) IN ('pending_confirmation', 'pending_checkout', 'pending_market')
       ${timeFilter}
       ORDER BY created_at ASC`
    );
    const preorders = preordersRes.rows;

    let confirmedCount = 0;
    let swappedCount = 0;

    const { account, error } = await resolveAccount({});
    if (error || !account) {
      return res.status(500).json({ error: `WhatsApp account resolution failed: ${error}` });
    }

    // Local copy of inventory so we can mutate it
    const inventory = { ...availableInventory };

    for (const order of preorders) {
      const customerPhone = order.customer_phone;
      const itemName = order.ordered_item;
      const quantity = parseFloat(order.quantity);

      // Find if we have inventory for this item
      const inventoryKey = Object.keys(inventory).find(k => itemName.toLowerCase().includes(k.toLowerCase()));
      
      let isAvailable = false;
      if (inventoryKey && inventory[inventoryKey] >= quantity) {
        isAvailable = true;
      }

      if (isAvailable) {
        // Deduct inventory
        inventory[inventoryKey] -= quantity;
        
        // CONFIRM
        await pool.query(`UPDATE coexistence.meenzy_preorders SET order_status = 'confirmed' WHERE id = $1`, [order.id]);
        
        const receiptSummary = `${itemName} (${quantity} Kg) - Secured from catch`;
        const trackingId = order.id.toString();
        const templateMsg = `Order confirmed. Receipt: ${receiptSummary}. Tracking: ${trackingId}`;
        
        const localId = await insertPendingRow({
          account,
          toNumber: customerPhone,
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
          to: String(customerPhone).replace(/\D/g, ''),
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
        
        confirmedCount++;
      } else {
        // UNAVAILABLE -> SWAP
        const replacementData = unavailableItemsWithReplacements.find(u => itemName.toLowerCase().includes(u.item.toLowerCase()));
        if (!replacementData || !replacementData.replacements || replacementData.replacements.length === 0) continue;

        await pool.query(`UPDATE coexistence.meenzy_preorders SET order_status = 'AWAITING_FAILURE_SWAP' WHERE id = $1`, [order.id]);

        // Look up the old fish price from catalog for price-comparison at swap time
        let originalItemPrice = 0;
        try {
          const oldPriceRes = await pool.query(
            `SELECT price_in_inr FROM coexistence.meenzy_catalog WHERE item_name ILIKE $1 LIMIT 1`,
            [itemName]
          );
          if (oldPriceRes.rows.length > 0) {
            originalItemPrice = parseFloat(oldPriceRes.rows[0].price_in_inr) || 0;
          }
        } catch (_) {}

        meenzySessions[customerPhone] = {
          state: 'AWAITING_FAILURE_SWAP',
          preorderId: order.id,
          unavailableItemName: itemName,
          originalQuantity: quantity,
          originalItem: itemName,
          originalItemPrice,  // per-kg price of the OLD fish
          replacements: replacementData.replacements
        };

        const optionsRows = replacementData.replacements.map((alt, idx) => {
          const calculatedTotal = quantity * alt.price_in_inr;
          return {
            id: `swap_alt_${idx + 1}`,
            title: `Swap: ${alt.item_name.substring(0, 18)}`,
            description: `Rate: ₹${alt.price_in_inr}/Kg | Total: ₹${calculatedTotal}`
          };
        });

        optionsRows.push({ id: "swap_cancel", title: "Cancel & Refund 💵", description: "Cancel preorder & receive full refund" });
        optionsRows.push({ id: "swap_postpone", title: "Postpone Delivery ⏳", description: "Postpone catch delivery to tomorrow" });

        const listPayload = {
          type: "list",
          header: { type: "text", text: `⚠️ Preorder Action Required` },
          body: { text: `We are sorry! *${itemName}* is not available in today's fresh catches.\n\nPlease select one of the following dynamic resolution options for your order of *${quantity} Kg*:` },
          action: { button: "Resolve Order", sections: [{ title: "Choose Resolution Path", rows: optionsRows }] }
        };

        const localId = await insertPendingRow({ account, toNumber: customerPhone, messageType: 'interactive', messageBody: `⚠️ Preorder Action Required: ${itemName} is unavailable.` });
        await enqueueSend({ kind: 'interactive', accountId: account.id, to: String(customerPhone).replace(/\D/g, ''), localMessageId: localId, payload: { interactive: listPayload } });

        swappedCount++;
      }
    }

    res.json({ ok: true, confirmedCount, swappedCount, remainingInventory: inventory });
  } catch (err) {
    console.error('[batch-agent] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/meenzy/forecast
 * Demand Forecasting Dashboard API
 * Aggregates preorders over the last 7 days to predict tomorrow's required catch.
 */
router.get('/meenzy/forecast', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        ordered_item,
        SUM(quantity) as total_quantity_last_7_days,
        ROUND((SUM(quantity) / 7.0), 2) as daily_average,
        COUNT(id) as total_orders
      FROM coexistence.meenzy_preorders
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY ordered_item
      ORDER BY total_quantity_last_7_days DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('[meenzy-forecast] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { router, processCheckout, confirmOrder, cancelOrder };
