const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcryptjs');
const { resolveAccount, insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');

// GET all active delivery agents
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        a.id, a.name, a.phone, a.vehicle_info, a.is_active, a.last_lat, a.last_lng, a.last_location_update,
        COALESCE(
          (SELECT COUNT(*) FROM coexistence.ecosystem_orders o WHERE o.assigned_agent_id = a.id AND o.status = 'DELIVERED'),
          0
        ) as total_deliveries,
        COALESCE(
          (SELECT COUNT(*) * 50 FROM coexistence.ecosystem_orders o WHERE o.assigned_agent_id = a.id AND o.status = 'DELIVERED'),
          0
        ) 
        + COALESCE(
          (SELECT SUM(amount) FROM coexistence.delivery_agent_bonuses b WHERE b.agent_id = a.id),
          0
        )
        - COALESCE(
          (SELECT SUM(amount) FROM coexistence.delivery_agent_payouts p WHERE p.agent_id = a.id),
          0
        ) as wallet_balance
      FROM coexistence.delivery_agents a
      WHERE a.is_active = true
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new delivery agent
router.post('/', async (req, res) => {
  const { name, phone, vehicle_info, pin } = req.body;
  if (!name || !phone || !pin || pin.length < 4) {
    return res.status(400).json({ error: 'Name, phone, and a PIN (min 4 digits) are required.' });
  }

  try {
    const pin_hash = await bcrypt.hash(pin, 10);
    const { rows } = await pool.query(`
      INSERT INTO coexistence.delivery_agents (name, phone, vehicle_info, pin_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, phone, vehicle_info, is_active
    `, [name, phone, vehicle_info, pin_hash]);
    
    const agent = rows[0];

    // Try sending a welcome WhatsApp message with the Agent Portal link
    try {
      const { account } = await resolveAccount({});
      if (account) {
        // Construct the frontend URL (fallback to live frontend if missing)
        const baseUrl = (process.env.CORS_ORIGIN || 'https://meenzy-frontend.onrender.com').replace(/\/$/, '');
        const portalUrl = `${baseUrl}/#/agent-portal`;
        
        const messageBody = `Hello ${name} 🚚!\n\nYou have been successfully registered as a Meenzy Delivery Agent.\n\nPlease log in to the Agent Portal here to view and manage your assigned deliveries:\n🔗 ${portalUrl}\n\n*Your Login Details:*\n📱 Phone: ${phone}\n🔒 PIN: ${pin}\n\nDrive safe!`;
        
        const localMessageId = await insertPendingRow({
          account,
          toNumber: phone,
          messageType: 'text',
          messageBody: messageBody,
        });

        await enqueueSend({
          kind: 'text',
          accountId: account.id,
          to: phone,
          localMessageId,
          payload: { body: messageBody },
        });
        console.log(`[deliveryAgents] Welcome message enqueued for ${phone}`);
      }
    } catch (msgErr) {
      console.error('[deliveryAgents] Failed to send welcome WhatsApp message:', msgErr.message);
    }

    res.json(agent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update agent location
router.put('/:id/location', async (req, res) => {
  const { id } = req.params;
  const { lat, lng } = req.body;
  try {
    const { rowCount } = await pool.query(`
      UPDATE coexistence.delivery_agents
      SET last_lat = $1, last_lng = $2, last_location_update = NOW()
      WHERE id = $3
    `, [lat, lng, id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Agent not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE agent
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM coexistence.delivery_agents WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST mark agent paid
router.post('/:id/payouts', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  try {
    await pool.query(`
      INSERT INTO coexistence.delivery_agent_payouts (agent_id, amount)
      VALUES ($1, $2)
    `, [id, amount]);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST award bonus to agent
router.post('/:id/bonuses', async (req, res) => {
  const { id } = req.params;
  const { amount, reason } = req.body;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid bonus amount' });
  }

  try {
    await pool.query(`
      INSERT INTO coexistence.delivery_agent_bonuses (agent_id, amount, reason)
      VALUES ($1, $2, $3)
    `, [id, amount, reason || 'Admin awarded bonus']);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
