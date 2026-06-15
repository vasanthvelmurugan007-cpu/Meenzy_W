const { Router } = require('express');
const pool = require('../db');

const router = Router();

router.get('/meenzy/dashboard/stats', async (req, res) => {
  try {
    const { rows: todayOrders } = await pool.query(`
      SELECT COUNT(*) as count 
      FROM coexistence.meenzy_preorders 
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    const { rows: activeDeliveries } = await pool.query(`
      SELECT COUNT(*) as count 
      FROM coexistence.meenzy_preorders 
      WHERE order_status = 'OUT_FOR_DELIVERY'
    `);

    const { rows: drivers } = await pool.query(`
      SELECT COUNT(*) as count 
      FROM coexistence.meenzy_delivery_agents
    `);
    
    const { rows: topItems } = await pool.query(`
      SELECT ordered_item, SUM(quantity) as total_qty
      FROM coexistence.meenzy_preorders
      WHERE DATE(created_at) = CURRENT_DATE
      GROUP BY ordered_item
      ORDER BY total_qty DESC
      LIMIT 5
    `);
    
    const { rows: recentOrders } = await pool.query(`
      SELECT p.id, p.customer_phone, p.ordered_item, p.quantity, p.order_status, p.created_at, a.name as driver_name
      FROM coexistence.meenzy_preorders p
      LEFT JOIN coexistence.meenzy_delivery_agents a ON p.driver_id = a.id
      ORDER BY p.created_at DESC
      LIMIT 10
    `);

    const { rows: pincodeStats } = await pool.query(`
      SELECT 
        COALESCE(substring(address_line from '\\y\\d{6}\\y'), 'Unknown Pincode') as pincode,
        COUNT(*) as order_count
      FROM coexistence.ecosystem_orders
      WHERE address_line IS NOT NULL
      GROUP BY pincode
      ORDER BY order_count DESC
    `);

    res.json({
      todayOrders: parseInt(todayOrders[0].count) || 0,
      activeDeliveries: parseInt(activeDeliveries[0].count) || 0,
      activeDrivers: parseInt(drivers[0].count) || 0,
      topItems,
      recentOrders,
      pincodeStats
    });

  } catch (err) {
    console.error('[meenzy-dashboard-stats] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/meenzy/dashboard/forecast', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT i.product_name, SUM(i.quantity) as total_quantity, COUNT(DISTINCT o.id) as order_count
      FROM coexistence.ecosystem_order_items i
      JOIN coexistence.ecosystem_orders o ON i.order_id = o.id
      WHERE o.created_at >= NOW() - INTERVAL '14 days'
      GROUP BY i.product_name
      ORDER BY total_quantity DESC
    `);

    if (rows.length === 0) {
      return res.json({ forecast: "Not enough data from the past 14 days to generate a forecast." });
    }

    const dataString = rows.map(r => `${r.product_name}: ${r.total_quantity}kg (across ${r.order_count} orders)`).join('\n');

    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'AI API Key missing' });

    const prompt = `You are an expert seafood demand forecaster for Meenzy Fresh Seafood in Kasimedu.
Based on our sales data from the last 14 days, predict exactly what we need to buy from the harbor tomorrow morning to fulfill demand without wasting inventory.
Here is the 14-day data:
${dataString}

Give a concise, bulleted list of recommended purchase quantities. Keep it professional, short, and highly actionable.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "model": "google/gemma-4-31b-it:free",
        "max_tokens": 500,
        "messages": [{ "role": "user", "content": prompt }]
      })
    });
    
    const data = await response.json();
    const forecastText = data?.choices?.[0]?.message?.content?.trim() || "Failed to generate forecast.";

    res.json({ forecast: forecastText });
  } catch (err) {
    console.error('[meenzy-forecast] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
router.get('/meenzy/dashboard/dynamic-pricing', async (req, res) => {
  try {
    const { generateDynamicPricingSuggestions } = require('../engine/dynamicPricingCron');
    const suggestions = await generateDynamicPricingSuggestions();
    res.json({ suggestions });
  } catch (err) {
    console.error('[dynamic-pricing-api] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/meenzy/dashboard/flash-sales/trigger', async (req, res) => {
  const { productName, price, quantity, message } = req.body;
  if (!productName || !price || !quantity || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const { triggerFlashSale } = require('../engine/flashSalesManager');
    const result = await triggerFlashSale(productName, price, quantity, message);
    res.json(result);
  } catch (err) {
    console.error('[flash-sales-api] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/meenzy/dashboard/zero-waste/trigger', async (req, res) => {
  try {
    const { generateZeroWasteDiscounts } = require('../engine/zeroWasteCron');
    const result = await generateZeroWasteDiscounts();
    res.json(result || { ok: false, msg: "No items selected for zero waste" });
  } catch (err) {
    console.error('[zero-waste-api] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
