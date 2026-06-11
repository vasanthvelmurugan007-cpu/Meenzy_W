const pool = require('../db');

const bulkSessions = {};

async function startBulkFlow(phone, account, insertPendingRow, enqueueSend) {
  const session = {
    state: 'AWAITING_FISH',
    fish_name: null,
    quantity_kg: null,
    delivery_date: null,
    occasion: null
  };
  bulkSessions[phone] = session;

  const msg = "🐟 *Meenzy Bulk Orders* 🌊\n\nThanks for reaching out! We supply fresh, live catch for restaurants and large events.\n\nTo start your custom quote, *what type of fish are you looking for?* (e.g. Seer Fish, Prawns, Crab)";
  
  const localId = await insertPendingRow({
    account,
    toNumber: phone,
    messageType: 'text',
    messageBody: msg,
  });
  
  await enqueueSend({
    kind: 'text',
    accountId: account.id,
    to: String(phone).replace(/\D/g, ''),
    localMessageId: localId,
    payload: { body: msg, previewUrl: false },
  });
  
  console.log(`[bulk-flow] Started bulk quote flow for ${phone}`);
  return true;
}

async function handleBulkText(phone, text, account, insertPendingRow, enqueueSend) {
  const session = bulkSessions[phone];
  if (!session) return false;

  let replyMsg = '';
  const trimmed = text.trim();

  if (session.state === 'AWAITING_FISH') {
    session.fish_name = trimmed;
    session.state = 'AWAITING_QTY';
    replyMsg = `Great choice! 🔪\n\n*How many Kgs* of ${trimmed} do you need?`;
  } 
  else if (session.state === 'AWAITING_QTY') {
    // Try to parse number
    const qty = parseFloat(trimmed.replace(/[^\d.-]/g, ''));
    if (isNaN(qty)) {
      replyMsg = "Please enter a valid number for the quantity (e.g., 10, 20.5).";
    } else {
      session.quantity_kg = qty;
      session.state = 'AWAITING_DATE';
      replyMsg = `Got it. ${qty} kg of ${session.fish_name}.\n\n📅 *When do you need it delivered?* (e.g., Tomorrow morning, Oct 12th)`;
    }
  } 
  else if (session.state === 'AWAITING_DATE') {
    session.delivery_date = trimmed;
    session.state = 'AWAITING_OCCASION';
    replyMsg = `Perfect.\n\nLastly, *what is the occasion?* (e.g., Wedding, Restaurant supply, House Party). This helps us select the best sizes for you!`;
  } 
  else if (session.state === 'AWAITING_OCCASION') {
    session.occasion = trimmed;
    
    // Save to database
    try {
      await pool.query(`
        INSERT INTO coexistence.meenzy_bulk_quotes (customer_phone, fish_name, quantity_kg, delivery_date, occasion, status)
        VALUES ($1, $2, $3, $4, $5, 'pending_review')
      `, [phone, session.fish_name, session.quantity_kg, session.delivery_date, session.occasion]);
      
      console.log(`[bulk-flow] Saved quote request for ${phone}`);
    } catch (err) {
      console.error('[bulk-flow] Error saving quote to db:', err.message);
    }

    replyMsg = `✅ *Request Received!*\n\nThank you! Our Procurement Manager is reviewing your request for *${session.quantity_kg}kg of ${session.fish_name}*.\n\nWe will check the market and send you a custom price quote shortly! 🌊`;
    
    // Clear session
    delete bulkSessions[phone];
  }

  if (replyMsg) {
    const localId = await insertPendingRow({
      account,
      toNumber: phone,
      messageType: 'text',
      messageBody: replyMsg,
    });
    
    await enqueueSend({
      kind: 'text',
      accountId: account.id,
      to: String(phone).replace(/\D/g, ''),
      localMessageId: localId,
      payload: { body: replyMsg, previewUrl: false },
    });
  }

  return true;
}

module.exports = {
  bulkSessions,
  startBulkFlow,
  handleBulkText
};
