const cron = require('node-cron');
const pool = require('../db');
const { enqueueSend } = require('../queue/sendQueue');
const { resolveAccount, insertPendingRow } = require('../services/messageSender');

function startFeedbackCron() {
  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('[feedback-cron] Running post-delivery feedback check...');
    try {
      // Find meenzy_preorders delivered more than 1 hour ago
      const { rows } = await pool.query(`
        SELECT id, customer_phone, ordered_item, 'preorder' as type
        FROM coexistence.meenzy_preorders
        WHERE order_status = 'DELIVERED' 
          AND created_at < NOW() - INTERVAL '1 hour'
          AND (feedback_sent = false OR feedback_sent IS NULL)
      `);

      // Find ecosystem_orders delivered more than 1 hour ago
      const { rows: ecoRows } = await pool.query(`
        SELECT id, user_phone as customer_phone, 'Your Seafood Order' as ordered_item, 'ecosystem' as type
        FROM coexistence.ecosystem_orders
        WHERE status = 'DELIVERED' 
          AND updated_at < NOW() - INTERVAL '1 hour'
          AND (feedback_sent = false OR feedback_sent IS NULL)
      `);

      const allRows = [...rows, ...ecoRows];

      if (allRows.length === 0) return;

      const { account, error } = await resolveAccount({});
      if (error || !account) {
        console.error('[feedback-cron] Failed to resolve account:', error);
        return;
      }

      for (const row of allRows) {
        const payload = {
          type: "interactive",
          interactive: {
            type: "button",
            body: {
              text: `🐟 *How was your ${row.ordered_item}?*\n\nWe hope you enjoyed your fresh catch today! We'd love to know how your experience was to ensure we always deliver the best quality.`
            },
            action: {
              buttons: [
                { type: "reply", reply: { id: `F_GREAT_${row.id}`, title: "⭐⭐⭐⭐⭐ Amazing" } },
                { type: "reply", reply: { id: `F_OKAY_${row.id}`, title: "⭐⭐⭐ It was okay" } },
                { type: "reply", reply: { id: `F_BAD_${row.id}`, title: "⭐ Had an issue" } }
              ]
            }
          }
        };

        const localId = await insertPendingRow({
          account, toNumber: row.customer_phone, messageType: 'interactive', messageBody: 'Post-Delivery Feedback'
        });
        await enqueueSend({
          kind: 'interactive', accountId: account.id, to: String(row.customer_phone).replace(/\D/g, ''), localMessageId: localId, payload
        });
        
        // Mark feedback as sent
        if (row.type === 'preorder') {
          await pool.query(`UPDATE coexistence.meenzy_preorders SET feedback_sent = true WHERE id = $1`, [row.id]);
        } else {
          await pool.query(`UPDATE coexistence.ecosystem_orders SET feedback_sent = true WHERE id = $1`, [row.id]);
        }
        
        console.log(`[feedback-cron] Sent feedback request for order ${row.id} to: ${row.customer_phone}`);
      }
    } catch (err) {
      console.error('[feedback-cron] Error:', err.message);
    }
  });
  console.log('[feedback-cron] Initialized.');
}

module.exports = { startFeedbackCron };
