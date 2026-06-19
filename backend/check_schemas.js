const { Pool } = require('pg');

const connectionString = 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true';
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const { rows: tables } = await pool.query(`
    SELECT table_schema, table_name FROM information_schema.tables WHERE table_name = 'meenzy_preorders'
  `);
  console.log('Schemas containing meenzy_preorders:', tables);
  pool.end();
}

run().catch(console.error);
