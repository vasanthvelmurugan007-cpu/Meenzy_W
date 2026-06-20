const pool = require('./src/db');

async function applyJitter() {
  try {
    console.log('Fetching orders...');
    
    // Update ecosystem_orders
    const { rows: ecoOrders } = await pool.query(`SELECT id, lat, lng FROM coexistence.ecosystem_orders WHERE lat IS NOT NULL AND lng IS NOT NULL`);
    let ecoUpdates = 0;
    for (const order of ecoOrders) {
      const jLat = (Math.random() - 0.5) * 0.001;
      const jLng = (Math.random() - 0.5) * 0.001;
      await pool.query(`UPDATE coexistence.ecosystem_orders SET lat = lat + $1, lng = lng + $2 WHERE id = $3`, [jLat, jLng, order.id]);
      ecoUpdates++;
    }
    console.log(`Updated ${ecoUpdates} ecosystem orders with jitter.`);

    // Note: meenzy_preorders doesn't have lat/lng columns, it uses ecosystem_orders for map display.
    // If it does have lat/lng, we'll update it too. Let's try to update it just in case.
    try {
      const { rows: preOrders } = await pool.query(`SELECT id, lat, lng FROM coexistence.meenzy_preorders WHERE lat IS NOT NULL AND lng IS NOT NULL`);
      let preUpdates = 0;
      for (const order of preOrders) {
        const jLat = (Math.random() - 0.5) * 0.001;
        const jLng = (Math.random() - 0.5) * 0.001;
        await pool.query(`UPDATE coexistence.meenzy_preorders SET lat = lat + $1, lng = lng + $2 WHERE id = $3`, [jLat, jLng, order.id]);
        preUpdates++;
      }
      console.log(`Updated ${preUpdates} meenzy_preorders with jitter.`);
    } catch (e) {
      console.log(`Note: meenzy_preorders might not have lat/lng columns or no rows to update. Skipping.`);
    }

    console.log('Jitter applied successfully!');
  } catch (err) {
    console.error('Error applying jitter:', err);
  } finally {
    process.exit(0);
  }
}

applyJitter();
