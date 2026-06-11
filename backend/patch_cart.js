const fs = require('fs');
let code = fs.readFileSync('backend/src/engine/cartManager.js', 'utf8');

const newCode = `
async function handleFreeformText(whatsappId, account, text) {
  const cart = await getOrCreateCart(whatsappId);
  if (cart.current_state === 'ITEM_SELECTED' || cart.current_state === 'CART_REVIEW') {
    // If they typed something like "I want it cleaned well", save it to context
    const context = cart.state_context || {};
    context.special_instructions = (context.special_instructions || '') + ' ' + text;
    
    await pool.query(\`
      UPDATE coexistence.meenzy_carts 
      SET state_context = $1, updated_at = NOW()
      WHERE whatsapp_id = $2 AND status = 'active'
    \`, [JSON.stringify(context), whatsappId]);

    const reply = "Got it! We'll make sure to follow your instructions: '" + text + "'. Please select your quantity below to continue:";
    const { insertPendingRow } = require('../services/messageSender');
    const { enqueueSend } = require('../queue/sendQueue');
    
    const localId = await insertPendingRow({ account, toNumber: whatsappId, messageType: 'text', messageBody: reply });
    await enqueueSend({ kind: 'text', accountId: account.id, to: String(whatsappId).replace(/\\D/g, ''), localMessageId: localId, payload: { body: reply, previewUrl: false } });
    
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
`;

code = code.replace("module.exports = {\n  handleCartState,\n  getOrCreateCart\n};", newCode);
fs.writeFileSync('backend/src/engine/cartManager.js', code);
console.log('cartManager.js patched');
