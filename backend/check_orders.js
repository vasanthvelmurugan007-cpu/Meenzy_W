const { Pool } = require('pg');

const connectionString = 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true';
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const { rows: tables } = await pool.query(`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'coexistence'
  `);
  console.log('--- TABLES IN SCHEMA COEXISTENCE ---');
  console.log(tables.map(t => t.table_name));

  const { rows: preCount } = await pool.query(`SELECT COUNT(*) FROM coexistence.meenzy_preorders`);
  console.log('Total preorders count:', preCount[0].count);

  const { rows: ecoCount } = await pool.query(`SELECT COUNT(*) FROM coexistence.ecosystem_orders`);
  console.log('Total ecosystem orders count:', ecoCount[0].count);

  pool.end();
}

run().catch(console.error);
