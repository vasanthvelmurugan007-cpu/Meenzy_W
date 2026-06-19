const pool = require('../db');
const { insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');
const { getPriceForExtractedItem, getCutOptionsForExtractedItem } = require('../catalogParser');
const { createPaymentLink } = require('../services/razorpayService');
// Native checkout implementation (Wix cart link functionality removed)

// Start the conversational order flow
async function startNativeOrderFlow(whatsappId, account, items) {
  // Items come from LLM: [{ item: 'vanjaram', qty: 1 }]
  
  const orderItems = items.map(o => {
    const qty = parseFloat(o.qty) || 1;
    const pricePerKg = getPriceForExtractedItem(o.item);
    const cuts = getCutOptionsForExtractedItem(o.item);
    return {
      name: o.item,
      qty,
      pricePerKg,
      availableCuts: cuts,
      selectedCut: null
    };
  });

  // Check if any item needs a cut selection
  const itemNeedingCutIndex = orderItems.findIndex(i => i.availableCuts && i.availableCuts.length > 0);

  const stateContext = {
    items: orderItems,
    currentItemIndex: itemNeedingCutIndex,
    native_state: itemNeedingCutIndex !== -1 ? 'AWAITING_CUT' : 'AWAITING_ADDRESS'
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Create or update cart for native order flow using a valid enum state (CART_REVIEW)
    await client.query(`
      INSERT INTO coexistence.meenzy_carts (whatsapp_id, current_state, state_context, status, cart_items, updated_at)
      VALUES ($1, 'CART_REVIEW', $2, 'active', '[]'::jsonb, now())
      ON CONFLICT (whatsapp_id) 
      DO UPDATE SET 
        current_state = 'CART_REVIEW', 
        state_context = $2,
        status = 'active',
        cart_items = '[]'::jsonb,
        updated_at = now()
    `, [whatsappId, JSON.stringify(stateContext)]);
    
    await client.query('COMMIT');

    // Prompt user for cut if needed
    if (itemNeedingCutIndex !== -1) {
      await askForCut(whatsappId, account, orderItems[itemNeedingCutIndex], itemNeedingCutIndex);
    } else {
      // No cuts needed, summarize cart and ask for address
      await sendCartSummaryAndAskAddress(whatsappId, account, stateContext);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[nativeOrderEngine] startNativeOrderFlow Error:', err);
  } finally {
    client.release();
  }
}

async function askForCut(whatsappId, account, item, index) {
  const text = `🐟 *${item.name}*\n\nPlease select how you want this cut:`;
  const buttons = item.availableCuts.slice(0, 3).map((cut, idx) => ({
    type: "reply",
    reply: {
      id: `C_CUT:${index}:${idx}`,
      title: cut.substring(0, 20)
    }
  }));

  const payload = {
    type: "button",
    body: { text },
    action: { buttons }
  };

  const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'interactive', messageBody: 'Select Cut' });
  await enqueueSend({ kind: 'interactive', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { interactive: payload } });
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
      
      await client.query(`
        INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status, address_line, payment_status)
        VALUES ($1, $2, $3, 'CONFIRMED', $4, 'COD')
      `, [whatsappId, itemName, item.qty, address]);
    }

    const orderItemsJson = JSON.stringify(items.map(i => ({
      product_id: i.name,
      name: i.name,
      quantity: i.qty,
      price: i.pricePerKg,
      cut: i.selectedCut
    })));

    await client.query(`
      INSERT INTO coexistence.ecosystem_orders 
      (user_phone, total_amount, status, payment_status, source, address_line, order_items)
      VALUES ($1, $2, 'CONFIRMED', 'COD', 'WHATSAPP_NATIVE', $3, $4::jsonb)
    `, [whatsappId, totalAmount, address, orderItemsJson]);

    await client.query(`
      UPDATE coexistence.meenzy_carts 
      SET current_state = 'COMPLETED', status = 'converted', updated_at = NOW()
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
    const errorMsg = `❌ Sorry, we couldn't generate a payment link at the moment. Please try again later.`;
    const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: 'Payment Error' });
    await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: errorMsg, previewUrl: false } });
  }
}

async function handleNativeInteraction(whatsappId, account, cart, incomingPayload, incomingText) {
  const context = cart.state_context || {};
  const items = context.items || [];
  const nativeState = context.native_state;

  if (cart.current_state === 'CART_REVIEW' && nativeState === 'AWAITING_CUT') {
    if (incomingPayload && incomingPayload.startsWith('C_CUT:')) {
      const parts = incomingPayload.split(':');
      const itemIdx = parseInt(parts[1], 10);
      const cutIdx = parseInt(parts[2], 10);
      
      if (items[itemIdx] && items[itemIdx].availableCuts[cutIdx]) {
        items[itemIdx].selectedCut = items[itemIdx].availableCuts[cutIdx];
        
        // Find next item needing cut
        const nextItemNeedingCutIndex = items.findIndex((i, idx) => idx > itemIdx && i.availableCuts && i.availableCuts.length > 0 && !i.selectedCut);
        
        const client = await pool.connect();
        try {
          if (nextItemNeedingCutIndex !== -1) {
            context.currentItemIndex = nextItemNeedingCutIndex;
            await client.query(`UPDATE coexistence.meenzy_carts SET state_context = $1 WHERE whatsapp_id = $2 AND status = 'active'`, [JSON.stringify(context), whatsappId]);
            await askForCut(whatsappId, account, items[nextItemNeedingCutIndex], nextItemNeedingCutIndex);
          } else {
            // All cuts done! Ask for address
            context.currentItemIndex = -1;
            context.native_state = 'AWAITING_ADDRESS';
            await client.query(`UPDATE coexistence.meenzy_carts SET state_context = $1 WHERE whatsapp_id = $2 AND status = 'active'`, [JSON.stringify(context), whatsappId]);
            await sendCartSummaryAndAskAddress(whatsappId, account, context);
          }
        } finally {
          client.release();
        }
        return true;
      }
    }
    return false;
  } else if (cart.current_state === 'CART_REVIEW' && nativeState === 'AWAITING_ADDRESS') {
    if (incomingText && incomingText.trim().length > 5) {
      context.address = incomingText.trim();
      context.native_state = 'AWAITING_PAYMENT_METHOD';
      const client = await pool.connect();
      try {
        await client.query(`UPDATE coexistence.meenzy_carts SET state_context = $1 WHERE whatsapp_id = $2 AND status = 'active'`, [JSON.stringify(context), whatsappId]);
      } finally {
        client.release();
      }
      
      await askForPaymentMethod(whatsappId, account);
      return true;
    } else {
      const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: 'Invalid Address' });
      await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: "Please provide a valid delivery address.", previewUrl: false } });
      return true;
    }
  } else if (cart.current_state === 'CART_REVIEW' && nativeState === 'AWAITING_PAYMENT_METHOD') {
    if (incomingPayload === 'PAY_ONLINE') {
      context.native_state = 'AWAITING_PAYMENT';
      const client = await pool.connect();
      try {
        await client.query(`UPDATE coexistence.meenzy_carts SET state_context = $1 WHERE whatsapp_id = $2 AND status = 'active'`, [JSON.stringify(context), whatsappId]);
      } finally {
        client.release();
      }
      await generatePaymentLinkAndSend(whatsappId, account, context);
      return true;
    } else if (incomingPayload === 'PAY_COD') {
      await finalizeCODOrder(whatsappId, account, context);
      return true;
    }
    return false;
  }

  return false;
}

module.exports = {
  startNativeOrderFlow,
  handleNativeInteraction
};
