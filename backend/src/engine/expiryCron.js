const pool = require('../db');
const { assertOrderTransition } = require('./stateMachine');

/**
 * Sweeps for expired ecosystem verifications every 60 seconds.
 */
function startExpiryCron() {
  setInterval(async () => {
    let client;
    try {
      client = await pool.connect();
      
      // Find expired verifications
      const { rows } = await client.query(`
        SELECT id, order_id 
        FROM coexistence.ecosystem_verifications
        WHERE status = 'SENT' AND otp_expires_at < NOW()
        FOR UPDATE SKIP LOCKED
      `);

      if (rows.length === 0) {
        return;
      }

      for (const row of rows) {
        await client.query('BEGIN');
        try {
          // Fetch order to check current state
          const { rows: orderRows } = await client.query(`
            SELECT id, status FROM coexistence.ecosystem_orders WHERE id = $1 FOR UPDATE
          `, [row.order_id]);
          
          if (orderRows.length === 0) {
            await client.query('ROLLBACK');
            continue;
          }

          const order = orderRows[0];
          const oldStatus = order.status;

          // Assert valid state transition
          if (oldStatus !== 'CANCELLED') {
             assertOrderTransition(oldStatus, 'CANCELLED');
          }

          // Mark verification as EXPIRED
          await client.query(`
            UPDATE coexistence.ecosystem_verifications
            SET status = 'EXPIRED'
            WHERE id = $1
          `, [row.id]);

          if (oldStatus !== 'CANCELLED') {
            // Cancel order
            await client.query(`
              UPDATE coexistence.ecosystem_orders
              SET status = 'CANCELLED', updated_at = NOW()
              WHERE id = $1
            `, [order.id]);

            // Audit Log
            await client.query(`
              INSERT INTO coexistence.ecosystem_order_history (order_id, from_status, to_status, reason)
              VALUES ($1, $2, $3, $4)
            `, [order.id, oldStatus, 'CANCELLED', 'OTP expired']);

            // Fetch order items to restock
            const { rows: items } = await client.query(`
              SELECT product_name, quantity FROM coexistence.ecosystem_order_items WHERE order_id = $1
            `, [order.id]);

            for (const item of items) {
              await client.query(`
                INSERT INTO coexistence.ecosystem_stock_logs (product_name, delta, reason, order_id)
                VALUES ($1, $2, $3, $4)
              `, [item.product_name, item.quantity, 'Restock due to verification expiry', order.id]);
            }
          }

          await client.query('COMMIT');
          console.log(`[ExpiryEngine] Cancelled order ${order.id} due to OTP expiration.`);
        } catch (innerErr) {
          await client.query('ROLLBACK');
          console.error(`[ExpiryEngine] Failed to process expiry for verification ${row.id}:`, innerErr.message);
        }
      }
    } catch (err) {
      console.error('[ExpiryEngine] Cron Error:', err.message);
    } finally {
      if (client) client.release();
    }
  }, 60 * 1000).unref();
}

module.exports = { startExpiryCron };
