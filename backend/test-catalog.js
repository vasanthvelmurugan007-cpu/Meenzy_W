const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost', // Since I'll run this inside the container
  database: 'postgres',
  password: 'admin',
  port: 5432,
});

async function run() {
  try {
    const res = await pool.query('SELECT "accessToken" FROM "WhatsAppNumber" LIMIT 1');
    const token = res.rows[0].accessToken;
    console.log("Token:", token.substring(0, 15) + "...");
    
    const catalogId = "2150289245547170";
    console.log("Fetching catalog products...");
    const fbRes = await axios.get(`https://graph.facebook.com/v19.0/${catalogId}/products`, {
      params: {
        access_token: token,
        fields: 'id,name,description,price,product_group',
        limit: 100
      }
    });
    
    console.log("Found products:", fbRes.data.data.length);
    if(fbRes.data.data.length > 0) {
      console.log(fbRes.data.data.slice(0, 5));
    }
  } catch(e) {
    console.error("Error:", e.response ? e.response.data : e.message);
  } finally {
    await pool.end();
  }
}

run();
