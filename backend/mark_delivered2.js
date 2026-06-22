const { Pool } = require('pg');

const connectionString = 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true';
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query("UPDATE coexistence.ecosystem_orders SET status = 'DELIVERED'");
    console.log('Updated rows in ecosystem_orders:', res.rowCount);
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

run();
