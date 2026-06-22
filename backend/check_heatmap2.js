const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true'
});

async function run() {
  try {
    const { rows } = await pool.query(`
      SELECT lat, lng, created_at
      FROM coexistence.ecosystem_orders
      WHERE lat IS NOT NULL AND lng IS NOT NULL
    `);
    console.log('Orders dates:', rows);
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();
