const fs = require('fs');
const path = require('path');

const filePath = path.join('backend', 'src', 'engine', 'cartManager.js');
let code = fs.readFileSync(filePath, 'utf8');

const search = `  async function getOrCreateCart(whatsappId) {
    const res = await pool.query(\`SELECT * FROM coexistence.meenzy_carts WHERE whatsapp_id = $1 AND status = 'active'\`, [whatsappId]);
    if (res.rows.length > 0) return res.rows[0];
    
    const insertRes = await pool.query(\`
      INSERT INTO coexistence.meenzy_carts (whatsapp_id, current_state, state_context)
      VALUES ($1, 'BROWSING', '{}'::jsonb)
      RETURNING *
    \`, [whatsappId]);
    return insertRes.rows[0];
  }`;

const replace = `  async function getOrCreateCart(whatsappId) {
    const res = await pool.query(\`SELECT * FROM coexistence.meenzy_carts WHERE whatsapp_id = $1 AND status = 'active'\`, [whatsappId]);
    if (res.rows.length > 0) return res.rows[0];
    
    const insertRes = await pool.query(\`
      INSERT INTO coexistence.meenzy_carts (whatsapp_id, current_state, state_context, status, cart_items, updated_at)
      VALUES ($1, 'BROWSING', '{}'::jsonb, 'active', '[]'::jsonb, now())
      ON CONFLICT (whatsapp_id)
      DO UPDATE SET
        current_state = 'BROWSING',
        state_context = '{}'::jsonb,
        status = 'active',
        cart_items = '[]'::jsonb,
        updated_at = now()
      RETURNING *
    \`, [whatsappId]);
    return insertRes.rows[0];
  }`;

if (code.includes(search)) {
  code = code.replace(search, replace);
  fs.writeFileSync(filePath, code);
  console.log('Patch successfully applied.');
} else {
  console.error('Target code not found. Please check manually.');
}
