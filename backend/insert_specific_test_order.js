require('dotenv').config();
const { Pool } = require('pg');
const { geocodeAddress } = require('./src/services/geocoder');

const pool = new Pool({
  connectionString: 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true',
  ssl: { rejectUnauthorized: false }
});

async function insertOrder() {
  const client = await pool.connect();
  try {
    const addressLine = 'Saraswathipura, Nandini Layout, Bengaluru, Karnataka 560096';
    const customerPhone = '9198765' + Math.floor(1000 + Math.random() * 9000);
    const totalPrice = 500 + Math.floor(Math.random() * 1000);
    const status = 'CREATED';
    
    console.log(`Geocoding address: ${addressLine}`);
    const geo = await geocodeAddress(addressLine);
    let lat = geo ? geo.lat : 13.0033;
    let lng = geo ? geo.lng : 77.5222;
    console.log(`Resolved to Lat: ${lat}, Lng: ${lng}`);

    await client.query('BEGIN');
    
    const { rows } = await client.query(`
      INSERT INTO coexistence.ecosystem_orders (user_phone, total_price, status, address_line, lat, lng, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING id
    `, [customerPhone, totalPrice, status, addressLine, lat, lng]);
    
    const orderId = rows[0].id;
    
    const items = ['Seer Fish', 'Pomfret', 'Prawns', 'Crab', 'Rohu', 'Mathi'];
    const prod = items[Math.floor(Math.random() * items.length)];
    
    await client.query(`
      INSERT INTO coexistence.ecosystem_order_items (order_id, product_name, quantity, price)
      VALUES ($1, $2, $3, $4)
    `, [orderId, prod, 1, totalPrice]);
    
    console.log(`Created test order ${orderId} at ${addressLine}`);
    
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error inserting order:', err);
  } finally {
    client.release();
    pool.end();
  }
}

insertOrder();
