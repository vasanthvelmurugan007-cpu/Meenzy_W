const pool = require('../db');
const { insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');
const { getPriceForExtractedItem, getCutOptionsForExtractedItem } = require('../catalogParser');
const { createPaymentLink } = require('../services/razorpayService');

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
      // No cuts needed, directly ask for address
      await askForAddress(whatsappId, account, orderItems);
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

async function askForAddress(whatsappId, account, items) {
  let confMsg = `✅ *Order Summary*\n\n`;
  let totalAmount = 0;

  for (const order of items) {
    let itemTotal = 0;
    if (order.pricePerKg > 0) {
      itemTotal = order.pricePerKg * order.qty;
      totalAmount += itemTotal;
    }
    const cutText = order.selectedCut ? ` (${order.selectedCut})` : '';
    confMsg += `• ${order.name}${cutText} - ${order.qty} Kg - ₹${itemTotal.toFixed(2)}\n`;
  }
  
  confMsg += `\n💰 *Total: ₹${totalAmount.toFixed(2)}*\n\n📍 *Please type your complete delivery address below:*`;

  const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: 'Ask Address' });
  await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: confMsg, previewUrl: false } });
}

async function generatePaymentAndSend(whatsappId, account, items, address) {
  const totalAmount = items.reduce((sum, item) => sum + (item.qty * item.pricePerKg), 0);
  const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);

  // Generate Razorpay Link
  const paymentLinkResponse = await createPaymentLink({
    amount: totalAmount,
    phone: whatsappId,
    description: `Meenzy Order ${orderId}`,
    referenceId: orderId
  });

  if (paymentLinkResponse.ok) {
    // Save to DB as pending payment
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update cart to awaiting payment and store orderId, address and payment ID
      await client.query(`
        UPDATE coexistence.meenzy_carts 
        SET current_state = 'CART_REVIEW', 
            state_context = jsonb_set(
                jsonb_set(
                    jsonb_set(state_context, '{orderId}', $1::jsonb),
                    '{paymentLinkId}', $2::jsonb
                ),
                '{native_state}', '"AWAITING_PAYMENT"'::jsonb
            ) || jsonb_build_object('address', $3::text),
            updated_at = NOW()
        WHERE whatsapp_id = $4 AND status = 'active'
      `, [`"${orderId}"`, `"${paymentLinkResponse.id}"`, address, whatsappId]);
      
      await client.query('COMMIT');
      
      const msg = `💳 *Complete Your Payment*\n\nTap the link below to pay securely:\n${paymentLinkResponse.short_url}\n\n_Your order will be confirmed automatically after payment._`;
      const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: 'Payment Link' });
      await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: msg, previewUrl: true } });
      
    } catch (e) {
      await client.query('ROLLBACK');
      console.error(e);
    } finally {
      client.release();
    }
  } else {
    const errorMsg = `❌ Sorry, we couldn't generate a payment link at this moment. Please try again later.`;
    const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: 'Payment Link Error' });
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
            // All cuts done! Ask for address.
            context.currentItemIndex = -1;
            context.native_state = 'AWAITING_ADDRESS';
            await client.query(`UPDATE coexistence.meenzy_carts SET state_context = $1 WHERE whatsapp_id = $2 AND status = 'active'`, [JSON.stringify(context), whatsappId]);
            await askForAddress(whatsappId, account, items);
          }
        } finally {
          client.release();
        }
        return true;
      }
    }
    return false;
  }

  if (cart.current_state === 'CART_REVIEW' && nativeState === 'AWAITING_ADDRESS') {
    if (incomingText && incomingText.trim().length > 5) { // Ensure they actually typed an address
      const address = incomingText.trim();
      await generatePaymentAndSend(whatsappId, account, items, address);
      return true;
    }
  }

  return false;
}

module.exports = {
  startNativeOrderFlow,
  handleNativeInteraction
};
