const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db');
const { resolveAccount, insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');
const { uploadMedia } = require('../integrations/metaSend');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 },
});

// POST /api/admin/marketing/broadcast
// Uploads an image to Meta and queues a broadcast to all customers.
router.post('/broadcast', upload.single('media'), async (req, res) => {
  try {
    const { caption } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No media file provided' });
    
    // Resolve WhatsApp account
    const { account, error } = await resolveAccount({});
    if (error || !account) return res.status(400).json({ error: 'No WhatsApp account configured' });

    console.log('[marketing-broadcast] Uploading media to Meta...');
    // Upload media to Meta to get the mediaId
    const uploadRes = await uploadMedia({
      accessToken: account.accessToken,
      phoneNumberId: account.phoneNumberId,
      buffer: file.buffer,
      mimeType: file.mimetype,
      filename: file.originalname,
    });
    
    const mediaId = uploadRes?.id;
    if (!mediaId) throw new Error('Failed to get media ID from Meta');

    console.log(`[marketing-broadcast] Media uploaded. ID: ${mediaId}`);

    // Find all distinct customers
    const { rows: customers } = await pool.query(`
      SELECT DISTINCT regexp_replace(customer_phone, '[^0-9]', '', 'g') as phone
      FROM coexistence.ecosystem_orders
      WHERE customer_phone IS NOT NULL AND customer_phone != ''
    `);

    if (customers.length === 0) {
      return res.status(400).json({ error: 'No customers found to broadcast to.' });
    }

    let queuedCount = 0;
    
    console.log(`[marketing-broadcast] Queueing messages to ${customers.length} customers...`);

    // Send to each customer
    for (const c of customers) {
      if (!c.phone || c.phone.length < 10) continue;
      
      const localId = await insertPendingRow({
        account,
        toNumber: c.phone,
        messageType: 'image',
        messageBody: caption || ''
      });

      await enqueueSend({
        kind: 'media',
        accountId: account.id,
        to: c.phone,
        localMessageId: localId,
        payload: {
          type: 'image',
          mediaId: mediaId,
          caption: caption || ''
        }
      });
      queuedCount++;
    }

    console.log(`[marketing-broadcast] Successfully queued ${queuedCount} messages.`);
    res.json({ ok: true, queuedCount });
  } catch (err) {
    console.error('[marketing-broadcast] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const { triggerWeekendReminders } = require('../engine/subscriptionCron');

// POST /api/admin/marketing/weekend-reminders
router.post('/weekend-reminders', async (req, res) => {
  try {
    const result = await triggerWeekendReminders();
    if (result.error) {
      return res.status(500).json({ error: result.error });
    }
    res.json({ ok: true, queuedCount: result.queuedCount });
  } catch (err) {
    console.error('[marketing-reminders] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
