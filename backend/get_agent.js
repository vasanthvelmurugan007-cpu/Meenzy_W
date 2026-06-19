const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const res = await pool.query('SELECT phone, plain_pin FROM coexistence.delivery_agents WHERE id = 13');
  console.log('Agent:', res.rows[0]);
  pool.end();
}
run();
