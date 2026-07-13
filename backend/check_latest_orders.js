const pool = require('./src/db');

async function check() {
  try {
    const resEco = await pool.query(`SELECT id, wix_order_id, user_phone, total_price, status, created_at FROM coexistence.ecosystem_orders ORDER BY created_at DESC LIMIT 5`);
    console.log('Ecosystem Orders (latest 5):');
    console.table(resEco.rows);

    const resPre = await pool.query(`SELECT id, customer_phone, ordered_item, quantity, order_status, created_at FROM coexistence.meenzy_preorders ORDER BY created_at DESC LIMIT 5`);
    console.log('Preorders (latest 5):');
    console.table(resPre.rows);
    
    const resErrors = await pool.query(`SELECT * FROM coexistence.broadcast_logs WHERE action = 'TEST' ORDER BY created_at DESC LIMIT 5`); // just anything as an error log?
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
check();
