require('dotenv').config();
const pool = require('./src/db');

async function fix() {
  try {
    await pool.query(`ALTER TABLE coexistence.ecosystem_orders ADD COLUMN IF NOT EXISTS pod_image_url TEXT`);
    console.log("Success: pod_image_url added.");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

fix();
