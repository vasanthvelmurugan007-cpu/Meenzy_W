require('dotenv').config();
const pool = require('./src/db');
const { encrypt } = require('./src/util/crypto');

async function main() {
  const wabaId = '947296248309455';
  const phoneNumberId = '1029237836947595';
  const accessToken = 'EAAesd3HZAPsYBRhpvInWC5XvMnEy9TZAnjgmghqS9tHjGkJZAgaJcNkdGYGIPSjMEZBExZCUZArqFZBRrDcyzC8AtDNw4qYbEVRzuMVKmMZC0R3Rn47Y2yLZCDUIoZAGr7NVOaULhn0YZAB18iLuir0ESPU0DMSIh2xKnGvu3X0WIwWKOyyL1srNwaysUFZAY8R2Wf97';
  const verifyToken = 'meenzy_secret_webhook_verify_2026';
  
  const displayName = `Meenzy Account`;
  const displayPhoneNumber = '0000000000'; // Placeholder, will sync from Meta later

  const encryptedAccess = encrypt(accessToken);
  const encryptedVerify = encrypt(verifyToken);

  try {
    const res = await pool.query(`
      UPDATE coexistence.whatsapp_accounts
      SET 
        display_name = $1,
        display_phone_number = $2,
        phone_number_id = $3,
        waba_id = $4,
        access_token_encrypted = $5,
        verify_token_encrypted = $6,
        is_active = TRUE
      WHERE id = 2 OR is_default = TRUE
      RETURNING *
    `, [displayName, displayPhoneNumber, phoneNumberId, wabaId, encryptedAccess, encryptedVerify]);
    
    console.log('Successfully setup whatsapp account:', res.rows[0].id);
  } catch (err) {
    console.error('Error inserting whatsapp account:', err);
  } finally {
    pool.end();
  }
}

main();
