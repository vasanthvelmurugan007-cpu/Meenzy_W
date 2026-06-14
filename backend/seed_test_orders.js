require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true',
  ssl: { rejectUnauthorized: false }
});

const chennaiLocations = [
  { pin: '600001', lat: 13.0883, lng: 80.2863 }, // Parrys
  { pin: '600002', lat: 13.0782, lng: 80.2741 }, // Mount Road
  { pin: '600003', lat: 13.0848, lng: 80.2764 }, // Park Town
  { pin: '600004', lat: 13.0381, lng: 80.2783 }, // Mylapore
  { pin: '600005', lat: 13.0617, lng: 80.2774 }, // Triplicane
  { pin: '600006', lat: 13.0569, lng: 80.2526 }, // Nungambakkam
  { pin: '600008', lat: 13.0754, lng: 80.2523 }, // Egmore
  { pin: '600014', lat: 13.0483, lng: 80.2642 }, // Royapettah
  { pin: '600017', lat: 13.0373, lng: 80.2334 }, // T. Nagar
  { pin: '600018', lat: 13.0346, lng: 80.2505 }, // Teynampet
  { pin: '600020', lat: 13.0033, lng: 80.2543 }, // Adyar
  { pin: '600021', lat: 13.1118, lng: 80.2878 }, // Royapuram
  { pin: '600024', lat: 13.0457, lng: 80.2198 }, // Kodambakkam
  { pin: '600028', lat: 13.0232, lng: 80.2730 }, // RA Puram
  { pin: '600032', lat: 13.0063, lng: 80.1983 }, // Guindy
  { pin: '600040', lat: 13.0844, lng: 80.2119 }, // Anna Nagar
  { pin: '600041', lat: 12.9815, lng: 80.2602 }, // Thiruvanmiyur
  { pin: '600042', lat: 12.9863, lng: 80.2183 }, // Velachery
  { pin: '600096', lat: 12.9663, lng: 80.2458 }, // Perungudi
  { pin: '600097', lat: 12.9348, lng: 80.2359 }, // Thoraipakkam
];

const items = ['Seer Fish', 'Pomfret', 'Prawns', 'Crab', 'Rohu', 'Mathi'];

async function cleanAndSeed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Delete previous test orders based on the 'Test Building' signature
    console.log('Cleaning up previous test orders...');
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
      console.log(`Deleted ${delRes.rowCount} old test orders.`);
    } else {
      console.log('No old test orders found.');
    }

    // 2. Insert new 20 Chennai test orders
    console.log('Seeding 20 new Chennai test orders...');
    for (let i = 0; i < 20; i++) {
      const loc = chennaiLocations[i % chennaiLocations.length];
      const customerPhone = '9198765' + Math.floor(1000 + Math.random() * 9000);
      const addressLine = `Test Building ${i+1}, Street ${i+1}, Chennai, Pincode: ${loc.pin}`;
      const totalPrice = 500 + Math.floor(Math.random() * 1000);
      const status = 'CREATED';
      
      const { rows } = await client.query(`
        INSERT INTO coexistence.ecosystem_orders (user_phone, total_price, status, address_line, lat, lng, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW() - ($7::text || ' minutes')::interval)
        RETURNING id
      `, [customerPhone, totalPrice, status, addressLine, loc.lat, loc.lng, Math.floor(Math.random() * 120)]);
      
      const orderId = rows[0].id;
      
      const itemCount = 1 + Math.floor(Math.random() * 2);
      for (let j = 0; j < itemCount; j++) {
        const prod = items[Math.floor(Math.random() * items.length)];
        const qty = 1 + Math.floor(Math.random() * 2);
        await client.query(`
          INSERT INTO coexistence.ecosystem_order_items (order_id, product_name, quantity, price)
          VALUES ($1, $2, $3, $4)
        `, [orderId, prod, qty, Math.floor(totalPrice / itemCount)]);
      }
      console.log(`Created order ${orderId} at Pincode ${loc.pin} (Chennai)`);
    }
    
    await client.query('COMMIT');
    console.log('Successfully cleaned and re-seeded 20 Chennai test orders!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding orders:', err);
  } finally {
    client.release();
    pool.end();
  }
}

cleanAndSeed();
