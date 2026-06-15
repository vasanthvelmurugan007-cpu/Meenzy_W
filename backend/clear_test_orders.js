require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true',
  ssl: { rejectUnauthorized: false }
});

async function clearTestOrders() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Cleaning up all test orders...');
    const { rows: testOrders } = await client.query(`
      SELECT id FROM coexistence.ecosystem_orders WHERE address_line LIKE 'Test Building%'
    `);
    
    const testOrderIds = testOrders.map(r => r.id);
    if (testOrderIds.length > 0) {
      // Delete items first to respect foreign keys
      await client.query(`
        DELETE FROM coexistence.ecosystem_order_items WHERE order_id = ANY($1::uuid[])
      `, [testOrderIds]);
      
      // Delete the orders
      const delRes = await client.query(`
        DELETE FROM coexistence.ecosystem_orders WHERE id = ANY($1::uuid[])
      `, [testOrderIds]);
      console.log(`Deleted ${delRes.rowCount} test orders.`);
    } else {
      console.log('No test orders found.');
    }

    await client.query('COMMIT');
    console.log('Successfully cleared all test orders!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error clearing test orders:', err);
  } finally {
    client.release();
    pool.end();
  }
}

clearTestOrders();
