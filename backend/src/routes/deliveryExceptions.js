const express = require('express');
const router = express.Router();
const pool = require('../db');
const { assertOrderTransition, assertDeliveryTransition } = require('../engine/stateMachine');
const { enqueueExceptionAlert } = require('../queue/exceptionQueue');

/**
 * POST /api/shipping/report-issue
 * Hit by 3PL provider when delivery fails.
 */
router.post('/report-issue', async (req, res) => {
  const { orderId, jobId, issueReason } = req.body;
  if (!orderId || !jobId) return res.status(400).json({ error: 'Missing orderId or jobId' });

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Lock and get order and job
    const { rows: orderRows } = await client.query(`
      SELECT status FROM coexistence.ecosystem_orders WHERE id = $1 FOR UPDATE
    `, [orderId]);
    if (orderRows.length === 0) throw new Error('Order not found');

    const { rows: jobRows } = await client.query(`
      SELECT status FROM coexistence.ecosystem_delivery_jobs WHERE id = $1 FOR UPDATE
    `, [jobId]);
    if (jobRows.length === 0) throw new Error('Job not found');

    const orderStatus = orderRows[0].status;
    const jobStatus = jobRows[0].status;

    // Assert Transitions
    assertOrderTransition(orderStatus, 'DELIVERY_FAILED_DISPUTED');
    assertDeliveryTransition(jobStatus, 'FAILED');

    // Update DB
    await client.query(`
      UPDATE coexistence.ecosystem_orders 
      SET status = 'DELIVERY_FAILED_DISPUTED', updated_at = NOW() 
      WHERE id = $1
    `, [orderId]);

    await client.query(`
      UPDATE coexistence.ecosystem_delivery_jobs 
      SET status = 'FAILED', updated_at = NOW() 
      WHERE id = $1
    `, [jobId]);

    // Audit Logs
    await client.query(`
      INSERT INTO coexistence.ecosystem_order_history (order_id, from_status, to_status, reason)
      VALUES ($1, $2, $3, $4)
    `, [orderId, orderStatus, 'DELIVERY_FAILED_DISPUTED', issueReason]);

    await client.query(`
      INSERT INTO coexistence.ecosystem_delivery_history (job_id, from_status, to_status, reason)
      VALUES ($1, $2, $3, $4)
    `, [jobId, jobStatus, 'FAILED', issueReason]);

    await client.query('COMMIT');

    // Safe enqueue outside of Postgres lock to avoid slowing down the transaction
    try {
      await enqueueExceptionAlert({ orderId, jobId, issueReason, timestamp: new Date() });
    } catch (qErr) {
      console.error('[DeliveryExceptions] Failed to enqueue exception alert:', qErr.message);
    }

    res.json({ ok: true, status: 'DELIVERY_FAILED_DISPUTED' });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('[DeliveryExceptions] Error:', err.message);
    res.status(400).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

module.exports = { router };
