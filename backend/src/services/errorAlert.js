const { getSingleAccount } = require('../routes/whatsappAccounts');
const pool = require('../db');

/**
 * Sends a critical system error alert to the admin's WhatsApp number.
 * Target Number: 919845444003
 * 
 * @param {string} context - The context or location of the error (e.g., 'Agent Portal Fetch').
 * @param {string} errorMessage - The exact error message.
 */
async function sendAdminErrorAlert(context, errorMessage) {
  try {
    const adminNumber = '919845444003';
    const account = await getSingleAccount();
    
    // Check if we have active credentials
    if (!account || !account.accessToken || !account.phoneNumberId) {
      console.error('[ErrorAlert] Active WhatsApp account details not found. Cannot send alert.');
      return;
    }

    const version = 'v20.0';
    const endpoint = `https://graph.facebook.com/${version}/${account.phoneNumberId}/messages`;
    
    // Construct the alert message
    const alertText = `🚨 *SYSTEM ERROR ALERT* 🚨\n\n*Context:* ${context}\n*Error:* ${errorMessage}\n\n_Please check the server logs immediately._`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: adminNumber,
      type: 'text',
      text: { body: alertText }
    };

    // Send the message to Meta
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
      console.error(`[ErrorAlert] Meta API error (HTTP ${res.status}):`, parsed?.error?.message || resText);
      return;
    }

    // Log the alert to chat_history so it appears in the admin's inbox context
    const wamid = parsed?.messages?.[0]?.id || `local-alert-${Date.now()}`;
    await pool.query(
      `INSERT INTO coexistence.chat_history 
       (message_id, phone_number_id, wa_number, contact_number, to_number, direction, message_type, message_body, status, timestamp)
       VALUES ($1, $2, $3, $4, $5, 'outgoing', 'text', $6, $7, NOW())
       ON CONFLICT (message_id) DO NOTHING`,
      [
        wamid,
        account.phoneNumberId,
        account.displayPhoneNumber.replace(/\\D/g, ''),
        adminNumber,
        adminNumber,
        alertText,
        'sent'
      ]
    );

    console.log(`[ErrorAlert] Successfully sent error alert to admin ${adminNumber}`);
  } catch (err) {
    console.error('[ErrorAlert] Exception sending error alert:', err.message);
  }
}

module.exports = {
  sendAdminErrorAlert
};
