const { Pool } = require('pg');

const connectionString = 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true';
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const { rows: contacts } = await pool.query(`SELECT id, name, contact_number, created_at FROM coexistence.contacts`);
  console.log('Contacts:', contacts);
  pool.end();
}

run().catch(console.error);
