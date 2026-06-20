const pool = require('./src/db');
pool.query(`SELECT p.*,
              COALESCE(
                (SELECT o.payment_status
                 FROM coexistence.ecosystem_orders o
                 JOIN coexistence.ecosystem_order_items i ON o.id = i.order_id
                 WHERE RIGHT(regexp_replace(o.user_phone, '\\D', '', 'g'), 10) = RIGHT(regexp_replace(p.customer_phone, '\\D', '', 'g'), 10)
                   AND i.product_name ILIKE '%' || p.ordered_item || '%'
                 ORDER BY o.created_at DESC LIMIT 1
                ),
                p.payment_status
              ) as true_payment_status
       FROM coexistence.meenzy_preorders p 
       ORDER BY p.created_at DESC`).then(res => { console.log('OK', res.rowCount); process.exit(0); }).catch(e => { console.error('ERROR', e.message); process.exit(1); });
