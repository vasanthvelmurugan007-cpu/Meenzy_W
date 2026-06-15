const pool = require('../db');

/**
 * Analyzes inventory levels and recent sales to suggest price optimizations.
 */
async function generateDynamicPricingSuggestions() {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing AI API Key");

    // Fetch active products and their stock/price
    const { rows: products } = await pool.query(`
      SELECT id, name, unit_price, stock_quantity, category 
      FROM coexistence.ecosystem_products 
      WHERE is_active = true
      ORDER BY stock_quantity DESC
      LIMIT 50
    `);

    // Fetch sales volume for the last 3 days
    const { rows: sales } = await pool.query(`
      SELECT p.name, SUM(o.quantity) as total_sold
      FROM coexistence.ecosystem_orders o
      JOIN coexistence.ecosystem_products p ON o.product_id = p.id
      WHERE o.created_at >= NOW() - INTERVAL '3 days'
      GROUP BY p.name
    `);

    const salesMap = {};
    sales.forEach(s => salesMap[s.name] = Number(s.total_sold));

    const inventoryData = products.map(p => ({
      name: p.name,
      current_price: p.unit_price,
      stock: p.stock_quantity,
      sold_last_3_days: salesMap[p.name] || 0
    }));

    const systemPrompt = `You are a Pricing & Revenue Optimization AI for Meenzy Fresh Seafood.
Analyze the following inventory and sales velocity data for the last 3 days.
Suggest specific pricing adjustments (price drops for high-stock slow-moving items to clear inventory, or price hikes for low-stock fast-moving items to maximize margin).
Keep your analysis extremely concise. Output your response STRICTLY as a JSON array of objects.
Each object must have:
- "product_name": (string)
- "current_price": (number)
- "suggested_price": (number)
- "reason": (string, 1 short sentence)

Input Data:
${JSON.stringify(inventoryData, null, 2)}

Output ONLY valid JSON. No markdown wrappers.`;

    let text = null;
    if (apiKey.startsWith("sk-or-v1-")) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemma-4-31b-it:free", max_tokens: 800, messages: [{ role: "user", content: systemPrompt }] })
      });
      const data = await response.json();
      text = data?.choices?.[0]?.message?.content?.trim();
    } else {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] })
      });
      const data = await response.json();
      text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    }

    if (text) {
      const parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, ''));
      return parsed;
    }
    return [];
  } catch (err) {
    console.error('[dynamic-pricing-cron] Error:', err.message);
    return [];
  }
}

module.exports = {
  generateDynamicPricingSuggestions
};
