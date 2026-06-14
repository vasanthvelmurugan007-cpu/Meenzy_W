const pool = require('../db');

/**
 * Generates a hyper-personalized recipe based on the user's latest order and query.
 */
async function generateRecipeLLM(contactNumber, messageText) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey && !process.env.GROQ_API_KEY) return null;

    // Fetch the latest order items for this customer
    const { rows: orderRows } = await pool.query(`
      SELECT ordered_item 
      FROM coexistence.meenzy_preorders 
      WHERE customer_phone = $1
      ORDER BY created_at DESC
      LIMIT 3
    `, [contactNumber]);

    let orderContext = "We don't have a record of a recent purchase.";
    if (orderRows.length > 0) {
      const items = orderRows.map(r => r.ordered_item).join(', ');
      orderContext = `The customer recently purchased the following items from us: ${items}.`;
    }

    const systemPrompt = `You are an expert South Indian seafood chef and customer service AI for Meenzy Fresh Seafood. 
A customer is asking for cooking advice, a recipe, or marinades.
Below is the customer's message and the seafood items they recently purchased from us.

Customer Message: "${messageText}"
${orderContext}

Instructions:
1. Write a concise, step-by-step recipe tailored to their query. If their query is vague (e.g. "how do I cook this"), assume they want to cook the item they most recently purchased.
2. Give it a catchy title.
3. Suggest the cooking time and a few basic ingredients they likely have at home.
4. Include a YouTube search link format: "Watch a tutorial here: https://www.youtube.com/results?search_query=[dish+name]"
5. CRITICAL: You must reply in the EXACT SAME LANGUAGE the customer used in their message. If they used English, use English. If they used Tamil (or Tanglish), use Tamil. If Hindi, use Hindi.
6. Use emojis to make it fun and appetizing. Keep it under 250 words.`;

    let replyText = null;

    if (apiKey && apiKey.startsWith("sk-or-v1-")) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-1.5-flash",
          max_tokens: 500,
          messages: [{ role: "user", content: systemPrompt }]
        })
      });
      const data = await response.json();
      replyText = data?.choices?.[0]?.message?.content?.trim();
    } else if (apiKey) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }]
          })
        });
        const data = await response.json();
        replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      } catch (e) {
        console.error('[aiRecipeAssistant] Gemini fetch error:', e.message);
      }
    }

    // Fallback to Groq if the main API failed or wasn't set correctly
    if (!replyText && process.env.GROQ_API_KEY) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: 500,
            messages: [{ role: "user", content: systemPrompt }]
          })
        });
        const data = await response.json();
        replyText = data?.choices?.[0]?.message?.content?.trim();
      } catch (e) {
        console.error('[aiRecipeAssistant] Groq fallback error:', e.message);
      }
    }

    return replyText;
  } catch (err) {
    console.error('[aiRecipeAssistant] Error:', err.message);
    return null;
  }
}

module.exports = {
  generateRecipeLLM
};
