require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const res = await pool.query(`SELECT id, customer_phone, order_status, address_line FROM coexistence.meenzy_preorders ORDER BY created_at DESC LIMIT 5`);
  console.log(res.rows);
  process.exit(0);
}
run();
