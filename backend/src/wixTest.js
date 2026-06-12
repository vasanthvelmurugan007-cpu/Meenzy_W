const pool = require('./db');
const { decrypt } = require('./util/crypto');

async function checkCatalogs() {
  try {
    const res = await pool.query("SELECT * FROM coexistence.whatsapp_accounts LIMIT 1;");
    if (res.rows.length === 0) {
      console.log("No accounts found!");
      return;
    }
    const row = res.rows[0];
    const accessToken = decrypt(row.access_token_encrypted);
    const phoneNumberId = row.phone_number_id;
    console.log(`Phone Number ID: ${phoneNumberId}`);
    
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/whatsapp_commerce_settings?access_token=${accessToken}`;
    console.log("Fetching Phone Number commerce settings...");
    const apiRes = await fetch(url);
    const json = await apiRes.json();
    console.log("Response:", JSON.stringify(json, null, 2));
  } catch (e) {
    console.error("Error:", e);
  } finally {
    pool.end();
  }
}

checkCatalogs();
