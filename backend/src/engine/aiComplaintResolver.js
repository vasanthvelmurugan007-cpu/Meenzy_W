const pool = require('../db');

/**
 * Automatically resolves a customer complaint using AI.
 * It checks the user's latest order status and agent location,
 * then generates a culturally appropriate, translated apology and update.
 */
async function handleAIComplaintResolution(contactNumber, messageText) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    // Fetch the latest order for this customer
    const { rows: orderRows } = await pool.query(`
      SELECT o.id, o.ordered_item, o.quantity, o.order_status, o.driver_id, d.name as agent_name, d.phone as agent_phone
      FROM coexistence.meenzy_preorders o
      LEFT JOIN coexistence.delivery_agents d ON o.driver_id = d.id
      WHERE o.customer_phone = $1
      ORDER BY o.created_at DESC
      LIMIT 1
    `, [contactNumber]);

    let orderContext = "No active recent orders found for this customer.";
    if (orderRows.length > 0) {
      const order = orderRows[0];
      orderContext = `Latest Order Status:\n- Item: ${order.quantity}kg of ${order.ordered_item}\n- Status: ${order.order_status}`;
      if (order.agent_name) {
        orderContext += `\n- Assigned Delivery Agent: ${order.agent_name} (Phone: ${order.agent_phone})`;
      }
    }

    const systemPrompt = `You are a highly empathetic Customer Service Manager for Meenzy Fresh Seafood. 
A customer has sent a complaint or issue regarding their order.
Below is the customer's message and their latest order details from our database.

Customer Message: "${messageText}"
${orderContext}

Instructions:
1. Write a sincere, empathetic apology.
2. Provide a real-time update using the order details provided above (e.g. if status is OUT_FOR_DELIVERY, tell them the agent is on the way).
3. Reassure them that a senior manager is also reviewing their case.
4. CRITICAL: You must reply in the EXACT SAME LANGUAGE the customer used in their message. If they used English, use English. If they used Tamil, use Tamil (Tamil script or Tanglish). If Hindi, use Hindi.
5. Use appropriate emojis. Keep it concise (under 4 sentences).`;

    let replyText = null;

    if (apiKey.startsWith("sk-or-v1-")) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-1.5-flash",
          max_tokens: 300,
          messages: [{ role: "user", content: systemPrompt }]
        })
      });
      const data = await response.json();
      replyText = data?.choices?.[0]?.message?.content?.trim();
    } else {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }]
        })
      });
      const data = await response.json();
      replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    }

    return replyText;
  } catch (err) {
    console.error('[aiComplaintResolver] Error:', err.message);
    return null;
  }
}

module.exports = {
  handleAIComplaintResolution
};
