const { CronJob } = require('cron');
const pool = require('../db');
const { resolveAccount, insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');

/**
 * Predictive Re-order Engine (Churn Prevention)
 * Runs daily at 10:00 AM to nudge customers who haven't ordered in 14 days.
 */
async function runReorderPredictions() {
  try {
    console.log('[predictive-reorder] Running daily churn prevention check...');

    // Find customers whose last preorder was > 14 days ago, 
    // AND who haven't been nudged in the last 14 days.
    const { rows: candidates } = await pool.query(`
      WITH UserLastOrder AS (
        SELECT customer_phone, MAX(created_at) as last_order_date
        FROM coexistence.meenzy_preorders
        GROUP BY customer_phone
      ),
      UserFavorite AS (
        SELECT DISTINCT ON (customer_phone)
          customer_phone, ordered_item
        FROM (
          SELECT customer_phone, ordered_item, COUNT(*) as c
          FROM coexistence.meenzy_preorders
          GROUP BY customer_phone, ordered_item
        ) sub
        ORDER BY customer_phone, c DESC
      )
      SELECT c.wa_number, c.contact_number, c.profile_name,
             u.last_order_date, f.ordered_item
      FROM coexistence.contacts c
      JOIN UserLastOrder u ON c.contact_number = u.customer_phone
      JOIN UserFavorite f ON c.contact_number = f.customer_phone
      WHERE u.last_order_date < NOW() - INTERVAL '14 days'
        AND (c.last_reorder_nudge_at IS NULL OR c.last_reorder_nudge_at < NOW() - INTERVAL '14 days')
    `);

    if (candidates.length === 0) {
      console.log('[predictive-reorder] No eligible customers found for nudging today.');
      return;
    }

    console.log(`[predictive-reorder] Found ${candidates.length} customers to nudge.`);

    const { account, error } = await resolveAccount({});
    if (error || !account) {
      console.error('[predictive-reorder] No valid WhatsApp account found:', error);
      return;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const candidate of candidates) {
        const name = candidate.profile_name || 'there';
        const item = candidate.ordered_item || 'fresh fish';
        
        const messageText = `Hi ${name}! 👋 It's been a while since your last order. \n\nWe have some incredibly fresh catch arriving this weekend. Would you like us to reserve some of your favorite *${item}*? 🐟\n\nJust reply to this message to secure yours before it sells out!`;

        const localId = await insertPendingRow({
          account,
          toNumber: candidate.contact_number,
          messageType: 'text',
          messageBody: messageText
        });

        await enqueueSend({
          kind: 'text',
          accountId: account.id,
          to: String(candidate.contact_number).replace(/\D/g, ''),
          localMessageId: localId,
          payload: { body: messageText, previewUrl: false }
        });

        // Update the last_reorder_nudge_at timestamp so we don't spam them tomorrow
        await client.query(`
          UPDATE coexistence.contacts
          SET last_reorder_nudge_at = NOW()
          WHERE contact_number = $1
        `, [candidate.contact_number]);

        console.log(`[predictive-reorder] Sent nudge to ${candidate.contact_number} for ${item}`);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    console.log('[predictive-reorder] Completed daily nudges.');
  } catch (error) {
    console.error('[predictive-reorder] Error running cron:', error);
  }
}

let job = null;

function startPredictiveReorderCron() {
  if (job) return;
  // Run every day at 10:00 AM
  job = new CronJob('0 10 * * *', () => {
    runReorderPredictions();
  }, null, true, 'Asia/Kolkata');
  console.log('[predictive-reorder] Cron job initialized (runs daily at 10:00 AM IST)');
  
  // Optional: Run once on startup for testing if needed
  // setTimeout(runReorderPredictions, 5000);
}

module.exports = { startPredictiveReorderCron, runReorderPredictions };
