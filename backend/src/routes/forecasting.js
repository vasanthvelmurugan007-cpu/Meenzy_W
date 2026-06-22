const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * GET /api/admin/forecasting/demand
 * Analyzes the last 30 days of preorders to forecast upcoming weekend demand.
 */
router.get('/demand', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        ordered_item as item,
        SUM(quantity) as total_quantity_30_days,
        (SUM(quantity) / 4.0) as weekly_projected_demand,
        COUNT(*) as order_count
      FROM coexistence.meenzy_preorders
      WHERE created_at >= NOW() - INTERVAL '30 days'
        AND order_status != 'cancelled'
      GROUP BY ordered_item
      ORDER BY weekly_projected_demand DESC
    `);

    // Format the response for the frontend
    const forecast = rows.map(row => ({
      item: row.item,
      total_quantity_30_days: parseFloat(row.total_quantity_30_days).toFixed(2),
      weekly_projected_demand: parseFloat(row.weekly_projected_demand).toFixed(2),
      order_count: parseInt(row.order_count, 10)
    }));

    res.json({
      ok: true,
      data: forecast,
      message: "Demand forecast calculated based on the last 30 days of order history."
    });
  } catch (error) {
    console.error('[forecasting-api] Error fetching demand forecast:', error);
    res.status(500).json({ ok: false, error: 'Failed to calculate demand forecast' });
  }
});

/**
 * GET /api/admin/forecasting/heatmap
 * Generates GeoJSON data for predictive demand heatmap visualization.
 */
router.get('/heatmap', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        lat, 
        lng, 
        COUNT(*) as weight 
      FROM coexistence.ecosystem_orders
      WHERE lat IS NOT NULL AND lng IS NOT NULL
      GROUP BY lat, lng
    `);

    const features = rows.map(row => ({
      type: 'Feature',
      properties: { weight: parseInt(row.weight, 10) },
      geometry: {
        type: 'Point',
        coordinates: [parseFloat(row.lng), parseFloat(row.lat)]
      }
    }));

    const geojson = {
      type: 'FeatureCollection',
      features
    };

    res.json({ ok: true, data: geojson });
  } catch (error) {
    console.error('[forecasting-api] Error fetching heatmap:', error);
    res.status(500).json({ ok: false, error: 'Failed to fetch heatmap data' });
  }
});

module.exports = { router };
