const express = require('express');
const pool = require('../db');

const router = express.Router();

/**
 * GET /api/b2b/products
 * Fetch bulk pricing
 */
router.get('/products', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT name, price, bulk_discount_tier1_min_qty, bulk_discount_tier1_pct
      FROM coexistence.ecosystem_products
      WHERE is_active = true
    `);
    
    // Simulate bulk pricing if none exists
    const b2bProducts = rows.map(p => ({
      name: p.name,
      retail_price: parseFloat(p.price),
      b2b_price: Math.floor(parseFloat(p.price) * 0.8), // 20% discount for B2B
      min_qty: 10 // Minimum 10kg order
    }));
    
    res.json(b2bProducts);
  } catch (err) {
    console.error('[b2b] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/b2b/order
 * Place a B2B order
 */
router.post('/order', async (req, res) => {
  const { businessName, gstNumber, phone, items } = req.body;
  if (!businessName || !phone || !items || items.length === 0) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // We can just dump this into meenzy_preorders with a special status
    for (const item of items) {
      await pool.query(`
        INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status)
        VALUES ($1, $2, $3, 'B2B_PENDING')
      `, [phone, `${item.name} (B2B - ${businessName})`, item.qty]);
    }
    
    // Send WhatsApp notification
    const { resolveAccount, insertPendingRow } = require('../services/messageSender');
    const { enqueueSend } = require('../queue/sendQueue');
    const { account } = await resolveAccount({});

    if (account) {
      const confMsg = `🏢 *B2B Order Received!*\n\nThank you ${businessName}!\nWe have received your bulk order request. Our wholesale manager will contact you shortly to confirm the GST invoice and delivery schedule.`;
      const targetPhone = '91' + String(phone).replace(/\D/g, '').slice(-10);
      
      const localId = await insertPendingRow({
        account, toNumber: targetPhone, messageType: 'text', messageBody: confMsg
      });
      await enqueueSend({
        kind: 'text', accountId: account.id, to: targetPhone, localMessageId: localId, payload: { body: confMsg, previewUrl: false }
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[b2b-order] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
