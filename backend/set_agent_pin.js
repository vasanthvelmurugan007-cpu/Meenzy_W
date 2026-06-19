const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const pin = '1234';
  const hash = await bcrypt.hash(pin, 10);
  await pool.query('UPDATE coexistence.delivery_agents SET plain_pin = $1, pin_hash = $2 WHERE id = 13', [pin, hash]);
  console.log('PIN set successfully to 1234');
  pool.end();
}
run();
