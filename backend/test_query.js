const pool = require('./src/db');

async function test() {
  try {
    const res = await pool.query(`
      SELECT p.*,
             (SELECT profile_name 
              FROM coexistence.contacts c 
              WHERE RIGHT(regexp_replace(c.wa_id, '\\D', '', 'g'), 10) = RIGHT(regexp_replace(p.customer_phone, '\\D', '', 'g'), 10) 
                AND profile_name IS NOT NULL 
              LIMIT 1
             ) as customer_name,
             COALESCE(
                (SELECT o.payment_status
                 FROM coexistence.ecosystem_orders o
                 JOIN coexistence.ecosystem_order_items i ON o.id = i.order_id
                 WHERE RIGHT(regexp_replace(o.user_phone, '\\D', '', 'g'), 10) = RIGHT(regexp_replace(p.customer_phone, '\\D', '', 'g'), 10)
                   AND i.product_name ILIKE '%' || p.ordered_item || '%'
                 ORDER BY o.created_at DESC LIMIT 1
                ),
                'COD'
             ) as true_payment_status
      FROM coexistence.meenzy_preorders p 
      ORDER BY p.created_at DESC LIMIT 1
    `);
    console.log(res.rows);
  } catch (err) {
    console.error('FULL ERROR:', err);
  } finally {
    process.exit();
  }
}

test();
