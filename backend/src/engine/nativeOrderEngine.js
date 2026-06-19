const pool = require('../db');
const { insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');
const { getPriceForExtractedItem, getCutOptionsForExtractedItem } = require('../catalogParser');
const { createPaymentLink } = require('../services/razorpayService');
const { getProductId } = require('../services/wixProductMap');
const { createWixCartLink } = require('../services/wixCartService');

// Helper to resolve cut options to specific Wix product IDs
function resolveWixProductId(itemName, cutStyle) {
  if (!itemName) return null;
  
  let resolvedName = itemName;
  if (cutStyle) {
    resolvedName = `${itemName} ${cutStyle}`;
  }
  
  let wixId = getProductId(resolvedName);
  if (!wixId && cutStyle) {
    let standardFish = itemName.toLowerCase();
    if (standardFish === 'vanjaram') standardFish = 'seer fish';
    wixId = getProductId(`${standardFish} ${cutStyle}`);
  }
  
  if (!wixId) {
    wixId = getProductId(itemName);
  }
  
  return wixId;
}

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
      // No cuts needed, directly generate and send Wix Cart Link
      await generateWixCartAndSend(whatsappId, account, orderItems);
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

async function generateWixCartAndSend(whatsappId, account, items) {
  const wixItems = [];
  for (const item of items) {
    const wixId = resolveWixProductId(item.name, item.selectedCut);
    if (wixId) {
      wixItems.push({ productId: wixId, quantity: item.qty });
    }
  }

  let wixCartUrl = null;
  if (wixItems.length > 0) {
    try {
      const wixCartRes = await createWixCartLink({
        phone: String(whatsappId).replace(/\D/g, ''),
        items: wixItems
      });
      if (wixCartRes.ok) {
        wixCartUrl = wixCartRes.cartUrl;
      }
    } catch (err) {
      console.error('[nativeOrderEngine] Wix cart link generation failed:', err.message);
    }
  }

  if (wixCartUrl) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE coexistence.meenzy_carts 
        SET current_state = 'COMPLETED', 
            status = 'converted', 
            updated_at = NOW()
        WHERE whatsapp_id = $1 AND status = 'active'
      `, [whatsappId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[nativeOrderEngine] DB update status error:', e.message);
    } finally {
      client.release();
    }

    const msg = `🛒 *Your Meenzy Cart is Ready!*\n\nTap the link below to complete your checkout and payment on our website:\n🔗 ${wixCartUrl}\n\n_Your items have been added automatically!_`;
    const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: 'Wix Cart Link' });
    await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\D/g, ''), localMessageId: localId, payload: { body: msg, previewUrl: true } });
  } else {
    const errorMsg = `❌ Sorry, we couldn't generate your cart link. Please try again or visit our website: https://www.meenzy.in`;
    const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: 'Wix Cart Error' });
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
            // All cuts done! Generate and send Wix Cart Link
            context.currentItemIndex = -1;
            context.native_state = 'COMPLETED';
            await client.query(`UPDATE coexistence.meenzy_carts SET state_context = $1 WHERE whatsapp_id = $2 AND status = 'active'`, [JSON.stringify(context), whatsappId]);
            await generateWixCartAndSend(whatsappId, account, items);
          }
        } finally {
          client.release();
        }
        return true;
      }
    }
    return false;
  }

  return false;
}

module.exports = {
  startNativeOrderFlow,
  handleNativeInteraction
};
