require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('Adding payment_status column...');
    await pool.query(`
      ALTER TABLE coexistence.meenzy_preorders 
      ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'UNKNOWN'
    `);
    
    // Update existing records based on order_status or if it exists in ecosystem_orders
    // Let's just default to 'ONLINE' for existing to be safe since COD was just added
    await pool.query(`
      UPDATE coexistence.meenzy_preorders
      SET payment_status = 'ONLINE'
      WHERE payment_status = 'UNKNOWN'
    `);
    
    console.log('Successfully added payment_status column!');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
