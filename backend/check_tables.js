const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true',
  ssl: { rejectUnauthorized: false }
});
async function check() {
  const res = await pool.query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
  `);
  console.log(res.rows);
  pool.end();
}
check();
