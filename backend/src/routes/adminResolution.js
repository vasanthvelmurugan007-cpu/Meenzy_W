const express = require('express');
const router = express.Router();
const pool = require('../db');
const { assertOrderTransition } = require('../engine/stateMachine');

/**
 * GET /api/admin/orders
 * Returns all ecosystem orders with their current state, items, and associated delivery jobs.
 */
router.get('/', async (req, res) => {
  try {
    const { rows: orders } = await pool.query(`
      SELECT o.id, o.wix_order_id, o.user_phone, o.total_price, o.status, o.address_line, o.lat, o.lng, o.created_at, o.assigned_agent_id, o.payment_status, o.delivery_instructions, o.notes,
             COALESCE(
               json_agg(
                 json_build_object('product_name', i.product_name, 'quantity', i.quantity, 'price', i.price)
               ) FILTER (WHERE i.id IS NOT NULL), '[]'
             ) as items,
             (SELECT json_build_object('id', j.id, 'status', j.status, 'rider_name', j.rider_name, 'provider_job_id', j.provider_job_id)
              FROM coexistence.ecosystem_delivery_jobs j
              WHERE j.order_id = o.id ORDER BY j.created_at DESC LIMIT 1) as latest_job
      FROM coexistence.ecosystem_orders o
      LEFT JOIN coexistence.ecosystem_order_items i ON o.id = i.order_id
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `);
    res.json({ ok: true, orders });
  } catch (err) {
    console.error('[AdminOrders] Fetch Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/admin/orders/bulk-assign
 * Body: { agentId: "123", orderIds: ["uuid1", "uuid2"] }
 */
router.post('/bulk-assign', async (req, res) => {
  const { agentId, orderIds } = req.body;
  if (!agentId) return res.status(400).json({ error: 'Agent ID is required' });

  try {
    const deliveryOtp = Math.floor(1000 + Math.random() * 9000).toString();
    let result;

    if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
      // Assign specific selected orders
      result = await pool.query(`
        UPDATE coexistence.ecosystem_orders 
        SET assigned_agent_id = $1, status = 'DISPATCHED_TO_3PL', delivery_otp = $2, updated_at = NOW() 
        WHERE id = ANY($3::uuid[])
        RETURNING id
      `, [agentId, deliveryOtp, orderIds]);
    } else {
      // Fallback: Assign all unassigned
      result = await pool.query(`
        UPDATE coexistence.ecosystem_orders 
        SET assigned_agent_id = $1, status = 'DISPATCHED_TO_3PL', delivery_otp = $2, updated_at = NOW() 
        WHERE assigned_agent_id IS NULL 
          AND status IN ('CREATED', 'CONFIRMED', 'VERIFIED_READY', 'PACKED')
        RETURNING id
      `, [agentId, deliveryOtp]);
    }

    if (result && result.rowCount > 0) {
      const { resolveAccount, insertPendingRow } = require('../services/messageSender');
      const { enqueueSend } = require('../queue/sendQueue');
      const { account } = await resolveAccount({});
      if (account) {
        const agentRes = await pool.query('SELECT phone FROM coexistence.delivery_agents WHERE id = $1', [agentId]);
        if (agentRes.rows.length > 0 && agentRes.rows[0].phone) {
          const agentPhone = String(agentRes.rows[0].phone).replace(/\D/g, '');
          const portalUrl = `${process.env.CORS_ORIGIN || 'https://meenzy-frontend.onrender.com'}/#/agent-portal`;
          const agentMsg = `🚚 *New Deliveries Assigned!*\n\nYou have been assigned ${result.rowCount} new order(s).\n\nPlease open your Agent Portal to view your routes:\n${portalUrl}`;
          const agentLocalId = await insertPendingRow({ account, toNumber: agentPhone, messageType: 'text', messageBody: agentMsg });
          await enqueueSend({ kind: 'text', accountId: account.id, to: agentPhone, localMessageId: agentLocalId, payload: { body: agentMsg, previewUrl: false } });
        }
      }
    }

    res.json({ success: true, assignedCount: result.rowCount });
  } catch (err) {
    console.error('Bulk assign agent error:', err);
    res.status(500).json({ error: 'Failed to bulk assign agent' });
  }
});

/**
 * POST /api/admin/orders/:id/reattempt
 * Moves a disputed order back to VERIFIED_READY and clears failed jobs.
 */
router.post('/:id/reattempt', async (req, res) => {
  const { id } = req.params;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(`
      SELECT status FROM coexistence.ecosystem_orders WHERE id = $1 FOR UPDATE
    `, [id]);
    if (rows.length === 0) throw new Error('Order not found');
    const oldStatus = rows[0].status;

    assertOrderTransition(oldStatus, 'VERIFIED_READY');

    await client.query(`
      UPDATE coexistence.ecosystem_orders 
      SET status = 'VERIFIED_READY', updated_at = NOW() 
      WHERE id = $1
    `, [id]);

    await client.query(`
      INSERT INTO coexistence.ecosystem_order_history (order_id, from_status, to_status, reason)
      VALUES ($1, $2, $3, $4)
    `, [id, oldStatus, 'VERIFIED_READY', 'Admin requested delivery reattempt']);

    // Delete or mark old jobs so they don't interfere
    await client.query(`
      DELETE FROM coexistence.ecosystem_delivery_jobs WHERE order_id = $1 AND status = 'FAILED'
    `, [id]);

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * POST /api/admin/orders/:id/cancel
 * Cancels a disputed order and restocks inventory.
 */
router.post('/:id/cancel', async (req, res) => {
  const { id } = req.params;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(`
      SELECT status FROM coexistence.ecosystem_orders WHERE id = $1 FOR UPDATE
    `, [id]);
    if (rows.length === 0) throw new Error('Order not found');
    const oldStatus = rows[0].status;

    assertOrderTransition(oldStatus, 'CANCELLED');

    await client.query(`
      UPDATE coexistence.ecosystem_orders 
      SET status = 'CANCELLED', updated_at = NOW() 
      WHERE id = $1
    `, [id]);

    await client.query(`
      INSERT INTO coexistence.ecosystem_order_history (order_id, from_status, to_status, reason)
      VALUES ($1, $2, $3, $4)
    `, [id, oldStatus, 'CANCELLED', 'Admin cancelled disputed order']);

    const { rows: items } = await client.query(`
      SELECT product_name, quantity FROM coexistence.ecosystem_order_items WHERE order_id = $1
    `, [id]);

    for (const item of items) {
      await client.query(`
        INSERT INTO coexistence.ecosystem_stock_logs (product_name, delta, reason, order_id)
        VALUES ($1, $2, $3, $4)
      `, [item.product_name, item.quantity, 'Admin cancellation restock', id]);
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * PUT /api/admin/orders/:id/status
 * Manually updates the status of an order.
 */
router.put('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status: newStatus } = req.body;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(`
      SELECT status FROM coexistence.ecosystem_orders WHERE id = $1 FOR UPDATE
    `, [id]);
    
    if (rows.length === 0) throw new Error('Order not found');
    const oldStatus = rows[0].status;

    assertOrderTransition(oldStatus, newStatus);

    // If transitioning to DISPATCHED_TO_3PL, generate an OTP
    let otp = null;
    let otpUpdateClause = '';
    if (newStatus === 'DISPATCHED_TO_3PL') {
      otp = Math.floor(1000 + Math.random() * 9000).toString(); // 4 digit OTP
      otpUpdateClause = `, delivery_otp = '${otp}'`;
    }

    await client.query(`
      UPDATE coexistence.ecosystem_orders 
      SET status = $1, updated_at = NOW() ${otpUpdateClause}
      WHERE id = $2
    `, [newStatus, id]);

    await client.query(`
      INSERT INTO coexistence.ecosystem_order_history (order_id, from_status, to_status, reason)
      VALUES ($1, $2, $3, $4)
    `, [id, oldStatus, newStatus, 'Admin manually updated status via CRM']);

    // Send WhatsApp notification if dispatched
    if (newStatus === 'DISPATCHED_TO_3PL' && otp) {
      const { resolveAccount, insertPendingRow } = require('../services/messageSender');
      const { enqueueSend } = require('../queue/sendQueue');
      const { account, error } = await resolveAccount({});
      if (account) {
        const { rows: orderRows } = await client.query('SELECT user_phone FROM coexistence.ecosystem_orders WHERE id = $1', [id]);
        if (orderRows.length > 0 && orderRows[0].user_phone) {
          const toPhone = String(orderRows[0].user_phone).replace(/\D/g, '');
          const trackingPhone = toPhone.slice(-4);
          const trackingLink = `${process.env.CORS_ORIGIN}/#/track/${id}?phone=${trackingPhone}`;
          const messageText = `🚚 *Order Dispatched!*\n\nYour Meenzy order is on the way!\n\n🔑 *Delivery OTP:* ${otp}\n_Please provide this 4-digit OTP to the delivery agent to receive your order._\n\n📍 *Track live:* ${trackingLink}`;
          
          const msgId = await insertPendingRow({
            account,
            toNumber: toPhone,
            messageType: 'text',
            messageBody: messageText
          });
          
          await enqueueSend({
            kind: 'text',
            accountId: account.id,
            to: toPhone,
            localMessageId: msgId,
            payload: { body: messageText }
          });
        }
      } else {
        console.error('[adminResolution] Failed to resolve account for OTP:', error);
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, newStatus });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

/**
 * PUT /api/admin/orders/:id/verify-delivery
 * Verifies the OTP and transitions to DELIVERED.
 */
router.put('/:id/verify-delivery', async (req, res) => {
  const { id } = req.params;
  const { otp } = req.body;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(`
      SELECT status, delivery_otp FROM coexistence.ecosystem_orders WHERE id = $1 FOR UPDATE
    `, [id]);
    
    if (rows.length === 0) throw new Error('Order not found');
    const order = rows[0];

    assertOrderTransition(order.status, 'DELIVERED');

    if (order.delivery_otp && order.delivery_otp !== otp) {
      throw new Error('Invalid OTP provided');
    }

    await client.query(`
      UPDATE coexistence.ecosystem_orders 
      SET status = 'DELIVERED', updated_at = NOW() 
      WHERE id = $1
    `, [id]);

    await client.query(`
      INSERT INTO coexistence.ecosystem_order_history (order_id, from_status, to_status, reason)
      VALUES ($1, $2, $3, $4)
    `, [id, order.status, 'DELIVERED', 'OTP successfully verified and order delivered']);

    await client.query('COMMIT');
    res.json({ ok: true, newStatus: 'DELIVERED' });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

module.exports = { router };

/**
 * PUT /api/admin/orders/:id/assign
 * Assigns an order to a delivery agent, generates OTP, and notifies customer.
 */
router.put('/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { agent_id } = req.body;
  
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Get current order data
    const { rows } = await client.query('SELECT status, delivery_otp, user_phone FROM coexistence.ecosystem_orders WHERE id = $1 FOR UPDATE', [id]);
    if (rows.length === 0) throw new Error('Order not found');
    
    const order = rows[0];
    const otp = order.delivery_otp || Math.floor(1000 + Math.random() * 9000).toString();

    // Assign agent, update status, set OTP
    await client.query(`
      UPDATE coexistence.ecosystem_orders 
      SET assigned_agent_id = $1, status = 'DISPATCHED_TO_3PL', delivery_otp = $2, updated_at = NOW() 
      WHERE id = $3
    `, [agent_id || null, otp, id]);
    
    if (agent_id) {
      await client.query(`
        INSERT INTO coexistence.ecosystem_order_history (order_id, from_status, to_status, reason)
        VALUES ($1, $2, $3, $4)
      `, [id, order.status, 'DISPATCHED_TO_3PL', 'Assigned to delivery agent']);

      // Send WhatsApp notification with OTP
      if (order.user_phone) {
        const { resolveAccount, insertPendingRow } = require('../services/messageSender');
        const { enqueueSend } = require('../queue/sendQueue');
        const { account, error } = await resolveAccount({});
        
        if (account) {
          const toPhone = String(order.user_phone).replace(/\D/g, '');
          const trackingPhone = toPhone.slice(-4);
          const trackingLink = `${process.env.CORS_ORIGIN || 'https://meenzy-frontend.onrender.com'}/#/track/${id}?phone=${trackingPhone}`;
          
          const msgText = `🚚 *Out for Delivery!*\n\nYour Meenzy order #${id.slice(0,6)} has been assigned to a delivery agent and is on its way!\n\n🔑 *Delivery OTP:* ${otp}\n(Please share this code with the driver to receive your order)\n\n📍 *Track your order live:*\n${trackingLink}`;
          
          const localId = await insertPendingRow({
            account, toNumber: toPhone, messageType: 'text', messageBody: 'Sent delivery assignment OTP'
          });
          await enqueueSend({
            kind: 'text', accountId: account.id, to: toPhone, localMessageId: localId,
            payload: { body: msgText, previewUrl: false }
          });
          
          // Send WhatsApp notification to Agent
          const agentRes = await client.query('SELECT phone FROM coexistence.delivery_agents WHERE id = $1', [agent_id]);
          if (agentRes.rows.length > 0 && agentRes.rows[0].phone) {
            const agentPhone = String(agentRes.rows[0].phone).replace(/\D/g, '');
            const portalUrl = `${process.env.CORS_ORIGIN || 'https://meenzy-frontend.onrender.com'}/#/agent-portal`;
            const agentMsg = `🚚 *New Delivery Assigned!*\n\nYou have been assigned Order #${id.slice(0,6)}.\n\nPlease open your Agent Portal to view the route and details:\n${portalUrl}`;
            const agentLocalId = await insertPendingRow({ account, toNumber: agentPhone, messageType: 'text', messageBody: agentMsg });
            await enqueueSend({ kind: 'text', accountId: account.id, to: agentPhone, localMessageId: agentLocalId, payload: { body: agentMsg, previewUrl: false } });
          }
        }
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, otp, status: 'DISPATCHED_TO_3PL' });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});
