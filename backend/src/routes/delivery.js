const { Router } = require('express');
const pool = require('../db');
const { resolveAccount, insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');

const router = Router();

// Get all delivery agents
router.get('/meenzy/delivery-agents', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM coexistence.meenzy_delivery_agents ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error('[delivery-agents] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a delivery agent
router.post('/meenzy/delivery-agents', async (req, res) => {
  const { name, phone, zone } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO coexistence.meenzy_delivery_agents (name, phone, zone) VALUES ($1, $2, $3) RETURNING *',
      [name, phone, zone]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('[delivery-agents] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Auto-assign confirmed orders to delivery agents by zone (or round-robin if no strict zone matching)
router.post('/meenzy/delivery-agents/assign', async (req, res) => {
  try {
    // Fetch all confirmed orders that haven't been assigned
    const ordersRes = await pool.query(`
      SELECT id, customer_phone, ordered_item, quantity, zone 
      FROM coexistence.meenzy_preorders 
      WHERE order_status = 'CONFIRMED' AND driver_id IS NULL AND delivery_date = CURRENT_DATE
    `);
    
    if (ordersRes.rows.length === 0) {
      return res.json({ ok: true, assigned: 0, message: 'No confirmed unassigned orders found.' });
    }

    // Fetch all delivery agents
    const agentsRes = await pool.query('SELECT * FROM coexistence.meenzy_delivery_agents');
    if (agentsRes.rows.length === 0) {
      return res.status(400).json({ error: 'No delivery agents available. Please add agents first.' });
    }

    const agents = agentsRes.rows;
    let agentIndex = 0;
    
    const assignedCount = ordersRes.rows.length;
    
    // Group orders by agent for the itinerary
    const itineraryByAgent = {};

    for (const order of ordersRes.rows) {
      // Zone-based assignment
      let agent = agents.find(a => a.zone && order.zone && a.zone.toLowerCase() === order.zone.toLowerCase());
      
      // Fallback to round-robin if no strict zone matching
      if (!agent) {
        agent = agents[agentIndex];
        agentIndex = (agentIndex + 1) % agents.length;
      }
      
      await pool.query(
        `UPDATE coexistence.meenzy_preorders SET driver_id = $1, order_status = 'OUT_FOR_DELIVERY' WHERE id = $2`,
        [agent.id, order.id]
      );
      
      if (!itineraryByAgent[agent.id]) itineraryByAgent[agent.id] = { agent, orders: [] };
      itineraryByAgent[agent.id].orders.push(order);
      
      // Notify Customer: Out for Delivery
      const { account, error } = await resolveAccount({});
      if (!error && account) {
        const text = `🚚 *Out for Delivery!*\n\nGood news! Your order of ${order.quantity}kg ${order.ordered_item} is out for delivery with our agent ${agent.name} (${agent.phone}). They will reach you shortly.`;
        const localId = await insertPendingRow({ account, toNumber: order.customer_phone, messageType: 'text', messageBody: text });
        await enqueueSend({ kind: 'text', accountId: account.id, to: String(order.customer_phone).replace(/\\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
      }
    }
    
    // Send Itinerary to each Agent
    for (const agentId of Object.keys(itineraryByAgent)) {
      const data = itineraryByAgent[agentId];
      const { account, error } = await resolveAccount({});
      if (!error && account) {
        let text = `📦 *Morning Itinerary for ${data.agent.name}*\n\nYou have ${data.orders.length} stops:\n\n`;
        data.orders.forEach((o, i) => {
          text += `${i + 1}. Phone: ${o.customer_phone} - ${o.quantity}kg ${o.ordered_item}\n`;
        });
        text += `\nPlease deliver these safely!`;
        const localId = await insertPendingRow({ account, toNumber: data.agent.phone, messageType: 'text', messageBody: text });
        await enqueueSend({ kind: 'text', accountId: account.id, to: String(data.agent.phone).replace(/\\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
      }
    }

    res.json({ ok: true, assigned: assignedCount });
  } catch (err) {
    console.error('[delivery-agents-assign] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public Tracking Endpoint
router.get('/public/track/:orderId', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT o.id, o.order_status, o.ordered_item, o.quantity, o.pod_image_url, 
             a.name as driver_name, a.phone as driver_phone, a.driver_lat, a.driver_lng
      FROM coexistence.meenzy_preorders o
      LEFT JOIN coexistence.meenzy_delivery_agents a ON o.driver_id = a.id
      WHERE o.id = $1 OR o.id::text = $1
    `, [req.params.orderId]);
    
    if (rows.length === 0) {
      // It might be a Wix ecosystem order
      const { rows: wixRows } = await pool.query(`SELECT status FROM coexistence.ecosystem_orders WHERE id = $1 OR wix_order_id = $1`, [req.params.orderId]);
      if (wixRows.length > 0) {
        return res.json({ status: wixRows[0].status });
      }
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    console.error('[public-track] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
