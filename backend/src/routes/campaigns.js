const { Router } = require('express');
const pool = require('../db');
const { resolveAccount, insertPendingRow } = require('../services/messageSender');
const { enqueueSend } = require('../queue/sendQueue');

const router = Router();

router.get('/meenzy/campaigns/target-audience', async (req, res) => {
  const { item } = req.query;
  if (!item) return res.status(400).json({ error: 'Item parameter is required' });

  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT customer_phone 
      FROM coexistence.meenzy_preorders 
      WHERE ordered_item ILIKE $1
    `, [`%${item}%`]);

    res.json({ audienceSize: rows.length, phones: rows.map(r => r.customer_phone) });
  } catch (err) {
    console.error('[meenzy-campaigns-audience] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/meenzy/campaigns/generate', async (req, res) => {
  const { item } = req.body;
  if (!item) return res.status(400).json({ error: 'Item parameter is required' });

  try {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'LLM API key not configured' });

    const prompt = `You are the lead marketer for Meenzy Fresh Seafood. 
Write a highly engaging, urgent 2-sentence WhatsApp marketing message targeting customers who previously bought ${item}. 
Let them know that we just received a fresh catch of ${item} directly from the boats today.
Tell them to reply to this message with their quantity to place a preorder immediately before it sells out.
Use emojis. No markdown headers. Make it sound like a friendly text from a local fisherman.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }]
      })
    });
    
    const data = await response.json();
    const generatedMessage = data?.choices?.[0]?.message?.content?.trim();

    if (!generatedMessage) {
      return res.status(500).json({ error: 'Failed to generate message from LLM' });
    }

    res.json({ message: generatedMessage });
  } catch (err) {
    console.error('[meenzy-campaigns-generate] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/meenzy/campaigns/send', async (req, res) => {
  const { phones, message } = req.body;
  if (!phones || !Array.isArray(phones) || !message) {
    return res.status(400).json({ error: 'Phones array and message are required' });
  }

  try {
    const { account, error } = await resolveAccount({});
    if (error || !account) {
      return res.status(500).json({ error: 'WhatsApp account not resolved' });
    }

    let queuedCount = 0;
    for (const phone of phones) {
      const localId = await insertPendingRow({
        account, toNumber: phone, messageType: 'text', messageBody: message
      });
      await enqueueSend({
        kind: 'text', accountId: account.id, to: String(phone).replace(/\\D/g, ''), localMessageId: localId, payload: { body: message, previewUrl: false }
      });
      queuedCount++;
    }

    res.json({ ok: true, queued: queuedCount });
  } catch (err) {
    console.error('[meenzy-campaigns-send] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
