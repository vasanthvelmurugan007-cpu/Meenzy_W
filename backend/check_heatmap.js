const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true'
});

async function run() {
  try {
    const { rows } = await pool.query(`
      SELECT lat, lng, COUNT(*) as weight 
      FROM coexistence.ecosystem_orders
      WHERE lat IS NOT NULL AND lng IS NOT NULL
      GROUP BY lat, lng
    `);
    console.log('Orders with lat/lng:', rows);
    
    const { rows: allOrders } = await pool.query(`
      SELECT COUNT(*) as total FROM coexistence.ecosystem_orders
    `);
    console.log('Total orders:', allOrders[0].total);

    const { rows: allPreorders } = await pool.query(`
        SELECT COUNT(*) as total FROM coexistence.meenzy_preorders
    `);
    console.log('Total preorders:', allPreorders[0].total);
    
    const { rows: preordersWithLatLng } = await pool.query(`
        SELECT lat, lng, COUNT(*) as weight 
        FROM coexistence.meenzy_preorders
        WHERE lat IS NOT NULL AND lng IS NOT NULL
        GROUP BY lat, lng
    `);
    console.log('Preorders with lat/lng:', preordersWithLatLng);

  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();
