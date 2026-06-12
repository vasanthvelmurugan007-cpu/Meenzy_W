const express = require('express');
const router = express.Router();
const pool = require('../db');
const { resolveAccount, insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');

/**
 * POST /api/marketing/flash-sale
 * Triggers a "Fresh Catch" flash sale broadcast to recent customers.
 * Body: { item, discountPrice, quantityLeft, imageUrl, testPhone (optional) }
 */
router.post('/flash-sale', async (req, res) => {
  const { item, discountPrice, quantityLeft, imageUrl, testPhone } = req.body;
  if (!item || !discountPrice) {
    return res.status(400).json({ error: 'item and discountPrice are required' });
  }

  try {
    const { account, error } = await resolveAccount({});
    if (error || !account) {
      return res.status(500).json({ error: 'No WhatsApp account configured' });
    }

    let targets = [];
    if (testPhone) {
      targets.push({ phone: String(testPhone).replace(/\D/g, '') });
    } else {
      // Find active customers in the last 30 days
      const { rows } = await pool.query(`
        SELECT DISTINCT regexp_replace(customer_phone, '[^0-9]', '', 'g') as phone
        FROM coexistence.ecosystem_orders
        WHERE customer_phone IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days'
      `);
      targets = rows;
    }

    let queuedCount = 0;
    const messageText = `⚡ *FLASH SALE - FRESH CATCH JUST IN!* ⚡\n\nFresh *${item}* has just arrived from the harbor!\n\n🏷️ Special Price: *₹${discountPrice}/kg*\n🚨 Only *${quantityLeft || 'limited'}* available!\n\nReply with exactly *swap ${item}* if you want to switch your existing preorder, or click below to buy now!`;

    for (const t of targets) {
      if (!t.phone || t.phone.length < 10) continue;

      const payload = {
        type: "button",
        body: { text: messageText },
        action: {
          buttons: [
            { type: "reply", reply: { id: `fs_${item}`, title: `Claim 1kg Now ⚡` } },
            { type: "reply", reply: { id: "fs_ignore", title: "Skip" } }
          ]
        }
      };

      if (imageUrl) {
        payload.header = { type: "image", image: { link: imageUrl } };
      }

      const localId = await insertPendingRow({
        account, toNumber: t.phone, messageType: 'interactive', messageBody: 'Flash Sale Broadcast'
      });

      await enqueueSend({
        kind: 'interactive',
        accountId: account.id,
        to: t.phone,
        localMessageId: localId,
        payload: { interactive: payload }
      });
      queuedCount++;
    }

    res.json({ ok: true, message: `Flash sale triggered for ${queuedCount} users.` });
  } catch (err) {
    console.error('[flash-sale] Error:', err.message);
    res.status(500).json({ error: 'Failed to trigger flash sale' });
  }
});

module.exports = router;
