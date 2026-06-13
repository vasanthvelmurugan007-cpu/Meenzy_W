const express = require('express');
const pool = require('../db');

const router = express.Router();

/**
 * GET /api/tracking/:wixOrderId
 * Public endpoint to fetch order status. Requires ?phone=1234 (last 4 digits) for security.
 */
router.get('/:wixOrderId', async (req, res) => {
  const { wixOrderId } = req.params;
  const { phone } = req.query; // last 4 digits of the phone number

  if (!phone || phone.length !== 4) {
    return res.status(400).json({ error: 'Missing or invalid phone verification digits' });
  }

  try {
    const { rows: orders } = await pool.query(`
      SELECT o.id, o.wix_order_id, o.user_phone, o.total_price, o.status, o.address_line, o.created_at, o.assigned_agent_id,
             a.name as agent_name, a.vehicle_info as agent_vehicle, a.last_lat as agent_lat, a.last_lng as agent_lng,
             COALESCE(
               json_agg(
                 json_build_object('product_name', i.product_name, 'quantity', i.quantity, 'price', i.price)
               ) FILTER (WHERE i.id IS NOT NULL), '[]'
             ) as items,
             (SELECT json_build_object('status', j.status)
              FROM coexistence.ecosystem_delivery_jobs j
              WHERE j.order_id = o.id ORDER BY j.created_at DESC LIMIT 1) as latest_job
      FROM coexistence.ecosystem_orders o
      LEFT JOIN coexistence.ecosystem_order_items i ON o.id = i.order_id
      LEFT JOIN coexistence.delivery_agents a ON o.assigned_agent_id = a.id
      WHERE (o.wix_order_id = $1 OR o.id::text = $1)
      GROUP BY o.id, a.id
    `, [wixOrderId]);

    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orders[0];

    // Security Check: Verify last 4 digits of the stored phone number
    const storedPhone = order.user_phone.replace(/\D/g, '');
    const storedLast4 = storedPhone.slice(-4);
    if (storedLast4 !== phone) {
      return res.status(403).json({ error: 'Phone verification failed' });
    }

    // Mask the full phone number before returning
    const maskedPhone = storedPhone.slice(0, 2) + '*'.repeat(storedPhone.length - 6) + storedLast4;

    res.json({
      ok: true,
      order: {
        id: order.wix_order_id,
        status: order.status,
        created_at: order.created_at,
        address: order.address_line,
        phone: maskedPhone,
        total_price: order.total_price,
        items: order.items,
        delivery_job_status: order.latest_job ? order.latest_job.status : null,
        agent: order.assigned_agent_id ? {
          name: order.agent_name,
          vehicle: order.agent_vehicle,
          lat: order.agent_lat,
          lng: order.agent_lng
        } : null
      }
    });
  } catch (err) {
    console.error('[TrackingAPI] Error fetching order:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
