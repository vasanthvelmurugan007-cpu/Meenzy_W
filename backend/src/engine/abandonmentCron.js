const cron = require('node-cron');
const pool = require('../db');
const { enqueueSend } = require('../queue/sendQueue');
const { resolveAccount, insertPendingRow } = require('../services/messageSender');

function startAbandonmentCron() {
  // Run every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('[abandonment-cron] Running temporary cart abandonment check...');
    try {
      const { rows } = await pool.query(`
        UPDATE coexistence.meenzy_temporary_carts
        SET current_step = 'abandoned'
        WHERE current_step = 'ai_intake_complete' 
          AND updated_at < NOW() - INTERVAL '45 minutes'
        RETURNING whatsapp_id, cart_json as cart_items;
      `);

      if (rows.length === 0) return;

      const { account, error } = await resolveAccount({});
      if (error || !account) {
        console.error('[abandonment-cron] Failed to resolve account:', error);
        return;
      }

      for (const row of rows) {
        if (!row.cart_items || row.cart_items.length === 0) continue; // Don't recover truly empty carts
        
        let nudgeText = "🌊 *Did you forget your catch?*\n\nYour fresh seafood is waiting in your cart. Our boats are arriving soon, complete your order before we run out of today's premium stock!";
        
        try {
          const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
          if (apiKey) {
            const prompt = `You are an AI sales assistant for Meenzy Fresh Seafood. 
The customer left these items in their cart: ${JSON.stringify(row.cart_items)}.
Write a very short, friendly 2-sentence WhatsApp nudge reminding them to checkout. 
Mention the specific fish they left behind to create a personalized feel, and add a little urgency about fresh stock. 
Use emojis. No markdown headers.`;
            
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "google/gemini-1.5-flash",
                max_tokens: 200,
                messages: [{ role: "user", content: prompt }]
              })
            });
            const data = await response.json();
            const text = data?.choices?.[0]?.message?.content?.trim();
            if (text) nudgeText = text;
          }
        } catch(e) {
          console.error('[abandonment-cron] LLM generation failed, falling back:', e.message);
        }

        const payload = {
          type: "button",
          body: {
            text: nudgeText
          },
          action: {
            buttons: [
              { type: "reply", reply: { id: "C_RESUME", title: "Resume My Cart 🛒" } },
              { type: "reply", reply: { id: "C_CLEAR", title: "Empty Cart" } }
            ]
          }
        };

        const localId = await insertPendingRow({
          account, toNumber: row.whatsapp_id, messageType: 'interactive', messageBody: 'Cart Recovery Message'
        });
        await enqueueSend({
          kind: 'interactive', accountId: account.id, to: String(row.whatsapp_id).replace(/\D/g, ''), localMessageId: localId, payload: { interactive: payload }
        });
        
        console.log(`[abandonment-cron] Sent recovery to: ${row.whatsapp_id}`);
      }
    } catch (err) {
      console.error('[abandonment-cron] Error:', err.message);
    }
  });
  console.log('[abandonment-cron] Initialized.');
}

module.exports = { startAbandonmentCron };
