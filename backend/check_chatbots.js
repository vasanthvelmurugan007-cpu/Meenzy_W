const { Pool } = require('pg');

const connectionString = 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true';
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const { rows: chatbots } = await pool.query(`SELECT id, name, status FROM coexistence.chatbots`);
  console.log('Chatbots in database:', chatbots);

  const { rows: contacts } = await pool.query(`SELECT COUNT(*) FROM coexistence.contacts`);
  console.log('Total contacts count:', contacts[0].count);

  const { rows: preorders } = await pool.query(`SELECT COUNT(*) FROM coexistence.meenzy_preorders`);
  console.log('Total preorders count:', preorders[0].count);

  pool.end();
}

run().catch(console.error);
