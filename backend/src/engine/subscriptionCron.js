const cron = require('node-cron');
const pool = require('../db');
const { resolveAccount, insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');

// Every Saturday at 1:00 PM (13:00)
// '0 13 * * 6'
function startSubscriptionCron() {
  cron.schedule('0 13 * * 6', async () => {
    console.log('[subscriptionCron] Running weekend subscription reminders...');
    await triggerWeekendReminders();
  });
  console.log('[subscriptionCron] Scheduled for every Saturday at 1:00 PM.');
}

async function triggerWeekendReminders() {
  try {
    const { account, error } = await resolveAccount({});
    if (error || !account) {
      console.error('[subscriptionCron] No WhatsApp account configured:', error);
      return { error: 'No WhatsApp account configured' };
    }

    // Find all users who ordered in the past 30 days on a Friday, Saturday, or Sunday.
    // In PostgreSQL, EXTRACT(DOW FROM date) returns 0 for Sunday, 5 for Friday, 6 for Saturday.
    const { rows: customers } = await pool.query(`
      SELECT DISTINCT regexp_replace(customer_phone, '[^0-9]', '', 'g') as phone
      FROM coexistence.ecosystem_orders
      WHERE customer_phone IS NOT NULL AND customer_phone != ''
        AND created_at >= NOW() - INTERVAL '30 days'
        AND EXTRACT(DOW FROM created_at) IN (0, 5, 6)
    `);

    if (customers.length === 0) {
      console.log('[subscriptionCron] No weekend customers found.');
      return { queuedCount: 0 };
    }

    let queuedCount = 0;
    
    // The message we will send
    const messageBody = "Hi from Meenzy! 🐟 We are heading to Kasimedu harbor tomorrow morning for the freshest Sunday catch. Would you like to reserve your usual seafood order? Reply 'YES' to confirm!";

    // Send to each customer
    for (const c of customers) {
      if (!c.phone || c.phone.length < 10) continue;
      
      const localId = await insertPendingRow({
        account,
        toNumber: c.phone,
        messageType: 'text',
        messageBody: messageBody
      });

      await enqueueSend({
        kind: 'text',
        accountId: account.id,
        to: c.phone,
        localMessageId: localId,
        payload: {
          body: messageBody
        }
      });
      queuedCount++;
    }

    console.log(`[subscriptionCron] Successfully queued weekend reminders for ${queuedCount} customers.`);
    return { queuedCount };
  } catch (err) {
    console.error('[subscriptionCron] Error:', err.message);
    return { error: err.message };
  }
}

module.exports = { startSubscriptionCron, triggerWeekendReminders };
