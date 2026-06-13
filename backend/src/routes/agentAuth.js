const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { resolveAccount, insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');

const JWT_SECRET = process.env.JWT_SECRET || 'forgecrm-secret-key-123';

// POST /api/agent-auth/register
router.post('/register', async (req, res) => {
  const { name, phone, vehicle_info, pin } = req.body;
  if (!name || !phone || !pin || pin.length < 4) {
    return res.status(400).json({ error: 'Name, phone, and a PIN (min 4 digits) are required.' });
  }

  try {
    // Check if phone already registered
    const { rows: existing } = await pool.query('SELECT id FROM coexistence.delivery_agents WHERE phone = $1', [phone]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Phone number is already registered.' });
    }

    const pin_hash = await bcrypt.hash(pin, 10);
    const { rows } = await pool.query(`
      INSERT INTO coexistence.delivery_agents (name, phone, vehicle_info, pin_hash, plain_pin, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING id, name, phone, vehicle_info
    `, [name, phone, vehicle_info, pin_hash, pin]);

    const agent = rows[0];
    const token = jwt.sign({ id: agent.id, role: 'agent' }, JWT_SECRET, { expiresIn: '30d' });

    // Save token in db
    await pool.query('UPDATE coexistence.delivery_agents SET auth_token = $1 WHERE id = $2', [token, agent.id]);

    // Send a welcome WhatsApp message with the Agent Portal link
    try {
      const { account } = await resolveAccount({});
      if (account) {
        const baseUrl = (process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
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
        console.log(`[AgentAuth] Welcome message enqueued for ${phone}`);
      }
    } catch (msgErr) {
      console.error('[AgentAuth] Failed to send welcome WhatsApp message:', msgErr.message);
    }

    res.json({ ok: true, agent, token });
  } catch (err) {
    console.error('[AgentAuth] Register error:', err);
    res.status(500).json({ error: 'Failed to register agent.' });
  }
});

// POST /api/agent-auth/login
router.post('/login', async (req, res) => {
  const { phone, pin } = req.body;
  if (!phone || !pin) {
    return res.status(400).json({ error: 'Phone and PIN are required.' });
  }

  try {
    // Normalize phone to just digits
    const digits = phone.replace(/\D/g, '');
    const last10 = digits.slice(-10);

    const { rows } = await pool.query(`
      SELECT id, name, phone, vehicle_info, pin_hash, is_active
      FROM coexistence.delivery_agents
      WHERE RIGHT(REGEXP_REPLACE(phone, '\\D', '', 'g'), 10) = $1
    `, [last10]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid phone or PIN.' });
    }

    const agent = rows[0];
    if (!agent.is_active) {
      return res.status(401).json({ error: 'Your account is disabled.' });
    }

    if (!agent.pin_hash) {
      // Legacy agent fallback - if they don't have a PIN, let them set one by returning a special error?
      // Or just fail. Let's let them login and we should probably force them to register instead.
      return res.status(401).json({ error: 'Please re-register your account to set a PIN.' });
    }

    const isMatch = await bcrypt.compare(pin, agent.pin_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid phone or PIN.' });
    }

    const token = jwt.sign({ id: agent.id, role: 'agent' }, JWT_SECRET, { expiresIn: '30d' });
    await pool.query('UPDATE coexistence.delivery_agents SET auth_token = $1 WHERE id = $2', [token, agent.id]);

    res.json({ ok: true, agent: { id: agent.id, name: agent.name, phone: agent.phone, vehicle_info: agent.vehicle_info }, token });
  } catch (err) {
    console.error('[AgentAuth] Login error:', err);
    res.status(500).json({ error: 'Failed to login.' });
  }
});

// GET /api/agent-auth/me
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'agent') throw new Error('Invalid role');
    
    const { rows } = await pool.query('SELECT id, name, phone, vehicle_info, is_active FROM coexistence.delivery_agents WHERE id = $1 AND auth_token = $2', [decoded.id, token]);
    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(401).json({ error: 'Session expired or agent disabled' });
    }
    
    res.json({ ok: true, agent: rows[0] });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;
