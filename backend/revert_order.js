require('dotenv').config();
const pool = require('./src/db');

async function revert() {
  try {
    const res = await pool.query(`
      UPDATE coexistence.meenzy_preorders 
      SET order_status = 'PENDING_CONFIRMATION' 
      WHERE order_status = 'confirmed' AND id NOT IN (
        SELECT CAST(id AS TEXT) FROM coexistence.ecosystem_orders
      )
      RETURNING id, ordered_item, customer_phone
    `);
    console.log("Reverted orders:", res.rows);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
revert();
