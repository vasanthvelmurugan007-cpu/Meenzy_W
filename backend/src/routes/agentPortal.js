const express = require('express');
const router = express.Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');
const { assertOrderTransition } = require('../engine/stateMachine');
const { sendAdminErrorAlert } = require('../services/errorAlert');

const JWT_SECRET = process.env.JWT_SECRET || 'forgecrm-secret-key-123';

// Middleware to verify agent token
const verifyAgent = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'agent') throw new Error('Invalid role');
    // Ensure the token agentId matches the URL agentId if present
    if (req.params.agentId && req.params.agentId !== decoded.id) {
      return res.status(403).json({ error: 'Forbidden: Cannot access other agent data' });
    }
    
    // Check if token is still valid in DB
    const { rows } = await pool.query('SELECT is_active FROM coexistence.delivery_agents WHERE id = $1 AND auth_token = $2', [decoded.id, token]);
    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(401).json({ error: 'Session expired or agent disabled' });
    }
    
    req.agent = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// GET orders assigned to a specific agent
router.get('/:agentId/orders', verifyAgent, async (req, res) => {
  const { agentId } = req.params;
  try {
    const { rows: orders } = await pool.query(`
      SELECT o.id, o.wix_order_id, o.user_phone, o.total_price, o.status, o.address_line, o.lat, o.lng, o.created_at, o.payment_status, o.delivery_instructions,
             (SELECT c.name FROM coexistence.contacts c WHERE RIGHT(regexp_replace(c.contact_number, '\\D', '', 'g'), 10) = RIGHT(regexp_replace(o.user_phone, '\\D', '', 'g'), 10) ORDER BY c.updated_at DESC LIMIT 1) as customer_name,
             COALESCE(
               json_agg(
                 json_build_object('product_name', i.product_name, 'quantity', i.quantity, 'price', i.price)
               ) FILTER (WHERE i.id IS NOT NULL), '[]'
             ) as items
      FROM coexistence.ecosystem_orders o
      LEFT JOIN coexistence.ecosystem_order_items i ON o.id = i.order_id
      WHERE o.assigned_agent_id = $1 AND o.status NOT IN ('DELIVERED', 'CANCELLED', 'DELIVERY_FAILED_DISPUTED')
      GROUP BY o.id
      ORDER BY o.created_at ASC
    `, [agentId]);
    res.json({ ok: true, orders });
  } catch (err) {
    console.error('[AgentOrders] Fetch Error:', err.message);
    sendAdminErrorAlert('Agent Portal: Fetch Assigned Orders Failure', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST proxy for Ola Maps Routing API
router.post('/ola-routing', verifyAgent, async (req, res) => {
  const { origin, destination, waypoints } = req.body;
  if (!origin || !destination) return res.status(400).json({ error: 'Origin and destination are required' });
  
  try {
    const olaMapsService = require('../services/olaMapsService');
    const routeData = await olaMapsService.getRoute(origin, destination, waypoints);
    if (!routeData) {
      return res.status(500).json({ error: 'Failed to fetch route from Ola Maps' });
    }
    res.json(routeData);
  } catch (err) {
    console.error('[AgentPortal] Routing Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update agent location
router.put('/:agentId/location', verifyAgent, async (req, res) => {
  const { agentId } = req.params;
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ error: 'Lat and Lng are required' });
  
  try {
    await pool.query(`
      UPDATE coexistence.delivery_agents
      SET last_lat = $1, last_lng = $2, last_location_update = NOW()
      WHERE id = $3
    `, [lat, lng, agentId]);
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[AgentLocation] Update Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET available orders (unassigned and ready for delivery)
router.get('/available-orders', verifyAgent, async (req, res) => {
  try {
    // Orders that have no agent assigned and are either PACKED or VERIFIED_READY (ready to be picked up)
    const { rows: orders } = await pool.query(`
      SELECT o.id, o.wix_order_id, o.user_phone, o.total_price, o.status, o.address_line, o.lat, o.lng, o.created_at, o.payment_status, o.delivery_instructions,
             (SELECT c.name FROM coexistence.contacts c WHERE RIGHT(regexp_replace(c.contact_number, '\\D', '', 'g'), 10) = RIGHT(regexp_replace(o.user_phone, '\\D', '', 'g'), 10) ORDER BY c.updated_at DESC LIMIT 1) as customer_name,
             COALESCE(
               json_agg(
                 json_build_object('product_name', i.product_name, 'quantity', i.quantity, 'price', i.price)
               ) FILTER (WHERE i.id IS NOT NULL), '[]'
             ) as items
      FROM coexistence.ecosystem_orders o
      LEFT JOIN coexistence.ecosystem_order_items i ON o.id = i.order_id
      WHERE o.assigned_agent_id IS NULL AND o.status IN ('PACKED', 'VERIFIED_READY')
      GROUP BY o.id
      ORDER BY o.created_at ASC
    `);
    res.json({ ok: true, orders });
  } catch (err) {
    console.error('[AgentOrders] Available Fetch Error:', err.message);
    sendAdminErrorAlert('Agent Portal: Fetch Available Orders Failure', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST claim an order
router.post('/:agentId/orders/:orderId/claim', verifyAgent, async (req, res) => {
  const { agentId, orderId } = req.params;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Lock the order row to prevent race conditions (multiple agents claiming at the same time)
    const { rows } = await client.query(`
      SELECT status, assigned_agent_id, user_phone FROM coexistence.ecosystem_orders 
      WHERE id = $1 FOR UPDATE
    `, [orderId]);
    
    if (rows.length === 0) throw new Error('Order not found');
    const order = rows[0];

    if (order.assigned_agent_id !== null) {
      throw new Error('This order has already been claimed by another agent.');
    }

    assertOrderTransition(order.status, 'DISPATCHED_TO_3PL');

    // Generate delivery OTP fallback
    const fallbackOtp = Math.floor(1000 + Math.random() * 9000).toString(); // 4 digit OTP

    const { rows: updateRows } = await client.query(`
      UPDATE coexistence.ecosystem_orders 
      SET assigned_agent_id = $1, status = 'DISPATCHED_TO_3PL', delivery_otp = COALESCE(delivery_otp, $2), updated_at = NOW()
      WHERE id = $3 RETURNING delivery_otp
    `, [agentId, fallbackOtp, orderId]);

    const finalOtp = updateRows[0].delivery_otp;

    await client.query(`
      INSERT INTO coexistence.ecosystem_order_history (order_id, from_status, to_status, reason)
      VALUES ($1, $2, $3, $4)
    `, [orderId, order.status, 'DISPATCHED_TO_3PL', 'Agent autonomously claimed order']);

    // Best-effort: Send WhatsApp notification
    const { resolveAccount } = require('../services/messageSender');
    const { account } = await resolveAccount({});
    if (account && order.user_phone) {
      const { enqueueSend } = require('../queue/sendQueue');
      const toPhone = String(order.user_phone).replace(/\D/g, '');
      const trackingPhone = toPhone.slice(-4);
      const trackingLink = `${process.env.CORS_ORIGIN || 'https://meenzy-frontend.onrender.com'}/#/track/${orderId}?phone=${trackingPhone}`;
      const msg = `🛵 Your order is out for delivery!\n\nAgent is on the way. Provide this OTP to receive your package: *${finalOtp}*\n\nTrack order: ${trackingLink}`;
      await enqueueSend(account.id, toPhone, 'text', { text: msg }, `dispatch_${orderId}`);
    }

    await client.query('COMMIT');
    res.json({ ok: true, message: 'Order claimed successfully!' });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});
// PUT update payment status
router.put('/:agentId/orders/:orderId/payment', verifyAgent, async (req, res) => {
  const { agentId, orderId } = req.params;
  const { payment_status } = req.body;
  try {
    const { rowCount } = await pool.query(`
      UPDATE coexistence.ecosystem_orders
      SET payment_status = $1, updated_at = NOW()
      WHERE id = $2 AND assigned_agent_id = $3
    `, [payment_status, orderId, agentId]);
    
    if (rowCount === 0) return res.status(404).json({ error: 'Order not found or not assigned to you' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT verify delivery with OTP
router.put('/:agentId/orders/:orderId/verify-delivery', verifyAgent, async (req, res) => {
  const { agentId, orderId } = req.params;
  const { otp, podImage } = req.body;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(`
      SELECT status, delivery_otp FROM coexistence.ecosystem_orders 
      WHERE id = $1 AND assigned_agent_id = $2 FOR UPDATE
    `, [orderId, agentId]);
    
    if (rows.length === 0) throw new Error('Order not found or not assigned to you');
    const order = rows[0];

    assertOrderTransition(order.status, 'DELIVERED');

    if (!order.delivery_otp || String(order.delivery_otp).trim() !== String(otp).trim()) {
      throw new Error('Invalid OTP provided');
    }

    await client.query(`
      UPDATE coexistence.ecosystem_orders 
      SET status = 'DELIVERED', updated_at = NOW(), pod_image_url = $1
      WHERE id = $2
    `, [podImage || null, orderId]);

    await client.query(`
      INSERT INTO coexistence.ecosystem_order_history (order_id, from_status, to_status, reason)
      VALUES ($1, $2, $3, $4)
    `, [orderId, order.status, 'DELIVERED', 'OTP successfully verified by delivery agent']);

    await client.query('COMMIT');
    res.json({ ok: true, newStatus: 'DELIVERED' });

    // Background Task: WhatsApp Feedback Request & Loyalty Coins
    setTimeout(async () => {
      try {
        const { resolveAccount } = require('../services/messageSender');
        const { account } = await resolveAccount({});
        
        // Refetch order to get phone number and total price
        const { rows: orderRows } = await pool.query('SELECT user_phone, total_price FROM coexistence.ecosystem_orders WHERE id = $1', [orderId]);
        if (orderRows.length > 0 && orderRows[0].user_phone && account) {
          const { enqueueSend } = require('../queue/sendQueue');
          const toPhone = String(orderRows[0].user_phone).replace(/\D/g, '');
          
          // Calculate Loyalty Coins (e.g. 5% of order value)
          const orderTotal = parseFloat(orderRows[0].total_price) || 0;
          const coinsEarned = Math.floor(orderTotal * 0.05);
          
          // Update customer's coin balance
          let totalCoins = coinsEarned;
          try {
            const { rows: contactRows } = await pool.query(`
              UPDATE coexistence.contacts 
              SET meenzy_coins = COALESCE(meenzy_coins, 0) + $1 
              WHERE RIGHT(regexp_replace(contact_number, '\\D', '', 'g'), 10) = RIGHT($2, 10)
              RETURNING meenzy_coins
            `, [coinsEarned, toPhone]);
            if (contactRows.length > 0) {
              totalCoins = contactRows[0].meenzy_coins;
            }
          } catch(e) {
            console.error('[Loyalty] Failed to update coins:', e.message);
          }

          const msg = `🌟 How was your Meenzy delivery?\n\nYour order has been delivered! Please reply to this message with a rating from 1 to 5 stars (5 being the best) to help us improve our service!\n\n🪙 *Loyalty Alert:* You just earned *${coinsEarned} Meenzy Coins*! You now have a total of *${totalCoins} Coins* which you can redeem on your next catch! 🌊`;
          await enqueueSend(account.id, toPhone, 'text', { text: msg }, `feedback_${orderId}`);
          console.log(`[Feedback] Sent feedback & loyalty request to ${toPhone} for order ${orderId}`);
        }
      } catch (fbErr) {
        console.error('[Feedback] Failed to send feedback request:', fbErr.message);
      }
    }, 60 * 1000); // 1 minute delay for testing

  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// PUT modify order (partial rejections)
router.put('/:agentId/orders/:orderId/modify', verifyAgent, async (req, res) => {
  const { agentId, orderId } = req.params;
  const { rejectedItems } = req.body; // Array of { product_name, quantity } to reject
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Lock the order
    const { rows: orderRows } = await client.query(`
      SELECT status, total_price 
      FROM coexistence.ecosystem_orders 
      WHERE id = $1 AND assigned_agent_id = $2 FOR UPDATE
    `, [orderId, agentId]);
    
    if (orderRows.length === 0) throw new Error('Order not found or not assigned to you');
    const order = orderRows[0];
    
    if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
      throw new Error('Cannot modify a delivered or cancelled order');
    }

    // Update order items
    let amountToDeduct = 0;
    
    for (const item of rejectedItems) {
      const { rows: itemRows } = await client.query(`
        SELECT id, quantity, price 
        FROM coexistence.ecosystem_order_items 
        WHERE order_id = $1 AND product_name = $2
      `, [orderId, item.product_name]);
      
      if (itemRows.length > 0) {
        const orderItem = itemRows[0];
        const rejectQty = Math.min(item.quantity, orderItem.quantity);
        
        amountToDeduct += (rejectQty * parseFloat(orderItem.price));
        
        if (rejectQty === orderItem.quantity) {
          await client.query('DELETE FROM coexistence.ecosystem_order_items WHERE id = $1', [orderItem.id]);
        } else {
          await client.query('UPDATE coexistence.ecosystem_order_items SET quantity = quantity - $1 WHERE id = $2', [rejectQty, orderItem.id]);
        }
      }
    }
    
    const newTotal = Math.max(0, parseFloat(order.total_price) - amountToDeduct);
    
    await client.query(`
      UPDATE coexistence.ecosystem_orders 
      SET total_price = $1, updated_at = NOW()
      WHERE id = $2
    `, [newTotal, orderId]);
    
    await client.query(`
      INSERT INTO coexistence.ecosystem_order_history (order_id, from_status, to_status, reason)
      VALUES ($1, $2, $3, $4)
    `, [orderId, order.status, order.status, `Agent modified order: Rejected items. Deducted ₹${amountToDeduct}`]);
    
    await client.query('COMMIT');
    res.json({ ok: true, newTotal });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    if (client) client.release();
  }
});

// POST optimize route using Mapbox Optimization API
router.post('/:agentId/optimize-route', verifyAgent, async (req, res) => {
  console.log('[optimize-route] Received body:', req.body);
  const { currentLat, currentLng, orders } = req.body || {};
  
  if (!orders || !Array.isArray(orders) || orders.length < 2) {
    return res.json({ ok: true, sequence: (orders || []).map(o => o.id) });
  }

  // Filter out orders missing valid coordinates
  const validOrders = orders.filter(o => o.lat && o.lng && !isNaN(parseFloat(o.lat)) && !isNaN(parseFloat(o.lng)));
  const missingOrders = orders.filter(o => !o.lat || !o.lng || isNaN(parseFloat(o.lat)) || isNaN(parseFloat(o.lng))).map(o => o.id);

  if (validOrders.length === 0) {
    return res.json({ ok: true, sequence: orders.map(o => o.id) });
  }

  try {
    const startLat = currentLat ? parseFloat(currentLat) : (validOrders.length > 0 ? parseFloat(validOrders[0].lat) : 13.123565);
    const startLng = currentLng ? parseFloat(currentLng) : (validOrders.length > 0 ? parseFloat(validOrders[0].lng) : 80.291771);

    // Haversine distance calculator (returns km)
    const haversineDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    };

    // Strict Nearest-Neighbor TSP Algorithm
    let unvisited = [...validOrders];
    let finalSequence = [];
    let curLat = startLat;
    let curLng = startLng;

    while (unvisited.length > 0) {
      let nearestIdx = -1;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const order = unvisited[i];
        const dist = haversineDistance(curLat, curLng, parseFloat(order.lat), parseFloat(order.lng));
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }

      const nearestOrder = unvisited.splice(nearestIdx, 1)[0];
      finalSequence.push(nearestOrder.id);
      curLat = parseFloat(nearestOrder.lat);
      curLng = parseFloat(nearestOrder.lng);
    }

    finalSequence = [...finalSequence, ...missingOrders];
    res.json({ ok: true, sequence: finalSequence });
  } catch (err) {
    console.error('[Ola Maps Optimize Error]', err.message);
    // Fallback to unoptimized sequence if something crashes
    res.json({ ok: true, sequence: orders.map(o => o.id) });
  }
});

// GET agent stats (total deliveries, earnings, wallet balance)
router.get('/:agentId/stats', verifyAgent, async (req, res) => {
  const { agentId } = req.params;
  try {
    const { rows: deliveryRows } = await pool.query(`
      SELECT COUNT(*) as total_deliveries
      FROM coexistence.ecosystem_orders
      WHERE assigned_agent_id = $1 AND status = 'DELIVERED'
    `, [agentId]);
    
    const totalDeliveries = parseInt(deliveryRows[0].total_deliveries, 10) || 0;
    // Flat ₹50 per delivery
    const totalEarnings = totalDeliveries * 50;

    // Calculate payouts
    const { rows: payoutRows } = await pool.query(`
      SELECT SUM(amount) as total_paid
      FROM coexistence.delivery_agent_payouts
      WHERE agent_id = $1
    `, [agentId]);
    
    const totalPaid = parseFloat(payoutRows[0].total_paid) || 0;
    const walletBalance = totalEarnings - totalPaid;

    // Calculate day-wise earnings (last 7 days)
    const { rows: dailyRows } = await pool.query(`
      SELECT DATE(updated_at) as date, COUNT(*) as deliveries
      FROM coexistence.ecosystem_orders
      WHERE assigned_agent_id = $1 AND status = 'DELIVERED'
      GROUP BY DATE(updated_at)
      ORDER BY date DESC
      LIMIT 7
    `, [agentId]);

    const earningsByDay = dailyRows.map(row => ({
      date: new Date(row.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      earnings: parseInt(row.deliveries, 10) * 50,
      deliveries: parseInt(row.deliveries, 10)
    }));

    res.json({ ok: true, stats: { totalDeliveries, totalEarnings, totalPaid, walletBalance, earningsByDay } });
  } catch (err) {
    console.error('[AgentStats] Error fetching stats:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT agent location
router.put('/:agentId/location', verifyAgent, async (req, res) => {
  const { agentId } = req.params;
  const { lat, lng } = req.body;
  try {
    await pool.query(`
      UPDATE coexistence.delivery_agents
      SET last_lat = $1, last_lng = $2, last_location_update = NOW()
      WHERE id = $3
    `, [lat, lng, agentId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[AgentLocation] Error updating location:', err.message);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// POST start route (Send WhatsApp Templates)
router.post('/:agentId/start-route', verifyAgent, async (req, res) => {
  const { orders } = req.body || {};

  if (!orders || !Array.isArray(orders) || orders.length === 0) {
    return res.json({ ok: false, error: 'No orders provided' });
  }

  try {
    // Fetch default WhatsApp account for sending templates
    const { rows } = await pool.query('SELECT access_token, phone_number_id FROM coexistence.whatsapp_accounts WHERE is_active = true ORDER BY created_at ASC LIMIT 1');
    const account = rows[0];

    if (!account || !account.access_token || !account.phone_number_id) {
      console.warn('[start-route] No active WhatsApp account found. Skipping templates.');
      return res.json({ ok: true });
    }

    const metaToken = account.access_token;
    const phoneNumberId = account.phone_number_id;

    const promises = orders.map(async (order) => {
      // Validate customer phone exists
      if (!order.user_phone) return;

      const customerName = order.customer_name || 'Customer';
      // Format phone number to E.164 without '+'
      let phone = order.user_phone.replace(/\D/g, '');
      if (!phone.startsWith('91') && phone.length === 10) {
        phone = '91' + phone;
      }

      // Wix order id or generated id — must match exactly what both portals display
      const orderIdDisplay = order.wix_order_id || String(order.id).split('-')[0].toUpperCase();

      const payload = {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "meeny_preorder",
          language: { code: "en" }
        }
      };

      try {
        const result = await fetch(`https://graph.facebook.com/${process.env.META_API_VERSION || 'v21.0'}/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${metaToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await result.json();
        if (!result.ok) {
          console.error(`[Meta API Error] sending out_for_delivery to ${phone}:`, data);
        } else {
          console.log(`[start-route] Sent WhatsApp template to ${phone} for order ${orderIdDisplay}`);
        }
      } catch (err) {
        console.error(`[Meta Network Error] sending to ${phone}:`, err.message);
      }
    });

    await Promise.allSettled(promises);
    res.json({ ok: true });
  } catch (err) {
    console.error('[start-route error]', err.message);
    res.json({ ok: false, error: err.message });
  }
});

module.exports = router;
