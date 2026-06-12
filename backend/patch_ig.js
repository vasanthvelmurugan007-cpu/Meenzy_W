require('dotenv').config();
const { encrypt } = require('./src/util/crypto');
const pool = require('./src/db');

async function run() {
  try {
    const token = process.env.IG_ACCESS_TOKEN;
    if (!token) {
      console.error('IG_ACCESS_TOKEN is not set in .env!');
      process.exit(1);
    }
    const encrypted = encrypt(token);
    await pool.query(`
      INSERT INTO coexistence.instagram_accounts (page_name, page_id, ig_account_id, access_token_encrypted) 
      VALUES ($1, $2, $3, $4) 
      ON CONFLICT (page_id) DO UPDATE SET access_token_encrypted = EXCLUDED.access_token_encrypted, page_name = EXCLUDED.page_name, updated_at = NOW()
    `, ['Meenzy India', '122093821557361558', '122093821557361558', encrypted]);
    console.log('✅ Instagram account "Meenzy India" inserted/updated successfully!');
    console.log('   Page ID: 122093821557361558');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

run();
