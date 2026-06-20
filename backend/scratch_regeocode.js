require('dotenv').config();
const { Pool } = require('pg');
const { geocodeAddress } = require('./src/services/geocoder');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('Connecting to remote database...');
    const { rows } = await pool.query("SELECT id, address_line FROM coexistence.ecosystem_orders WHERE status IN ('CREATED', 'CONFIRMED', 'VERIFIED_READY', 'PACKED', 'DISPATCHED_TO_3PL')");
    console.log(`Found ${rows.length} active orders to re-geocode.`);
    
    let updates = 0;
    for (const order of rows) {
      if (order.address_line) {
        console.log('\n--- Geocoding ---');
        console.log('Original Address:', order.address_line);
        const coords = await geocodeAddress(order.address_line);
        if (coords) {
          await pool.query('UPDATE coexistence.ecosystem_orders SET lat = $1, lng = $2 WHERE id = $3', [coords.lat, coords.lng, order.id]);
          console.log(`Updated Order ${order.id.slice(0,8)} to [${coords.lat}, ${coords.lng}]`);
          updates++;
        }
      }
    }
    console.log(`\n✅ Successfully re-geocoded ${updates} active orders using AI cleanup.`);
  } catch(e) {
    console.error('Error:', e);
  } finally {
    pool.end();
  }
}
run();
