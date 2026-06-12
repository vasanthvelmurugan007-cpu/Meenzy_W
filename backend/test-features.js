const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const baseUrl = 'http://localhost:3011/api';
const SECRET = 'b7c53d10526a0c5fe674251df8bf9ad8ca9f1d0b5e8c1b69785cd49d28e7de71';

async function testFeatures() {
  console.log('--- Testing New Meenzy Features ---');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:e7b99c43d9ebf1e9cd9f7b1d4ef678d2b271cb46@forgecrm-db:5432/postgres'
  });
  
  let user;
  try {
    const { rows } = await pool.query('SELECT * FROM coexistence.forgecrm_users LIMIT 1');
    user = rows[0];
  } catch(e) {
    console.error('DB Error:', e.message);
    process.exit(1);
  }
  
  if (!user) {
    console.error('No users found in database to impersonate.');
    process.exit(1);
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, displayName: user.display_name, role: user.role },
    process.env.JWT_SECRET || SECRET,
    { expiresIn: '1d' }
  );

  const headers = { 
    'Content-Type': 'application/json',
    'Cookie': `forgecrm_token=${token}`
  };

  // 1. Test Demand Forecasting API
  try {
    console.log('\\n[1] Testing /api/meenzy/forecast...');
    const forecastRes = await fetch(`${baseUrl}/meenzy/forecast`, { headers });
    if (forecastRes.ok) {
      const data = await forecastRes.json();
      console.log('✅ Forecast API OK. Results returned:', data.length);
      console.log(data.slice(0, 2));
    } else {
      console.error('❌ Forecast API Failed:', forecastRes.status, await forecastRes.text());
    }
  } catch(e) {
    console.error('❌ Forecast API Error:', e.message);
  }

  // 2. Test Batch Agent API
  try {
    console.log('\\n[2] Testing /api/meenzy/batch-agent/process...');
    const batchPayload = {
      availableItems: ['Seer Fish', 'Rohu'],
      unavailableItemsWithReplacements: [
        {
          item: 'Pomfret',
          replacements: [{ item_name: 'White Prawns', price_in_inr: 800 }]
        }
      ]
    };
    const batchRes = await fetch(`${baseUrl}/meenzy/batch-agent/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify(batchPayload)
    });
    if (batchRes.ok) {
      const data = await batchRes.json();
      console.log('✅ Batch Agent API OK. Result:', data);
    } else {
      console.error('❌ Batch Agent API Failed:', batchRes.status, await batchRes.text());
    }
  } catch(e) {
    console.error('❌ Batch Agent API Error:', e.message);
  }
  
  process.exit(0);
}

testFeatures();
