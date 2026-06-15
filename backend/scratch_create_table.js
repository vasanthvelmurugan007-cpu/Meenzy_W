require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres' });
client.connect().then(() => 
  client.query(`
    CREATE TABLE IF NOT EXISTS coexistence.meenzy_settings (
      key VARCHAR(255) PRIMARY KEY, 
      value JSONB NOT NULL, 
      updated_at TIMESTAMP DEFAULT NOW()
    ); 
    INSERT INTO coexistence.meenzy_settings (key, value) VALUES ('ai_autopilot_mode', 'false'::jsonb) ON CONFLICT (key) DO NOTHING;
  `)
).then(() => { 
  console.log('DB created'); 
  client.end(); 
}).catch(e => { 
  console.error(e); 
  client.end(); 
});
