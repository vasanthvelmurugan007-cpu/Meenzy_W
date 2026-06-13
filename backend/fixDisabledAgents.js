const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://meenzy_user:K5JoEIgNOVQ0ibYzbFRMBvIPsbDRZFTK@dpg-d8mhdgbtqb8s73c3hr4g-a.oregon-postgres.render.com/meenzy?ssl=true'
  });
  
  await client.connect();
  console.log('Connected to DB. Deleting disabled agents...');
  
  const res = await client.query(`
    DELETE FROM coexistence.delivery_agents 
    WHERE is_active = false
  `);
  
  console.log(`Deleted ${res.rowCount} disabled agents.`);
  await client.end();
}

run().catch(console.error);
