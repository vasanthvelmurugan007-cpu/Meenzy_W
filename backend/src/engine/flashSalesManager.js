const pool = require('../db');

/**
 * Trigger a new flash sale.
 * @param {string} productName e.g. 'Tiger Prawns'
 * @param {number} price e.g. 800
 * @param {number} quantity e.g. 5
 * @param {string} message The hype message
 */
async function triggerFlashSale(productName, price, quantity, message) {
  // 1. Create table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coexistence.meenzy_flash_sales (
      id SERIAL PRIMARY KEY,
      product_name VARCHAR(255) NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      total_quantity NUMERIC(10,2) NOT NULL,
      remaining_quantity NUMERIC(10,2) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // 2. Deactivate old ones for this product
  await pool.query(`
    UPDATE coexistence.meenzy_flash_sales SET is_active = FALSE WHERE product_name = $1
  `, [productName]);

  // 3. Create the flash sale
  const { rows } = await pool.query(`
    INSERT INTO coexistence.meenzy_flash_sales (product_name, price, total_quantity, remaining_quantity, is_active)
    VALUES ($1, $2, $3, $3, TRUE)
    RETURNING id
  `, [productName, price, quantity]);
  const flashSaleId = rows[0].id;

  // 4. Find all customers who previously bought this product
  const { rows: customers } = await pool.query(`
    SELECT DISTINCT RIGHT(regexp_replace(o.user_phone, '\\D', '', 'g'), 10) as phone
    FROM coexistence.ecosystem_orders o
    JOIN coexistence.ecosystem_order_items i ON o.id = i.order_id
    WHERE i.product_name ILIKE $1
    
    UNION
    
    SELECT DISTINCT RIGHT(regexp_replace(p.customer_phone, '\\D', '', 'g'), 10) as phone
    FROM coexistence.meenzy_preorders p
    WHERE p.ordered_item ILIKE $1
  `, [`%${productName}%`]);

  if (customers.length === 0) {
    return { ok: true, flashSaleId, targets: 0, msg: "No historical buyers found for this product." };
  }

  // 5. Broadcast to all target customers
  const { resolveAccount, insertPendingRow } = require('../services/messageSender');
  const { enqueueSend } = require('../queue/sendQueue');
  const { account, error } = await resolveAccount({});

  if (!error && account) {
    const broadcastText = `🚨 *FLASH SALE ALERT* 🚨\n\n${message}\n\n*Product:* ${productName}\n*Flash Price:* ₹${price}/Kg\n*Stock Available:* Only ${quantity} Kg!\n\nFirst come, first served. Click below to instantly secure 1Kg.`;

    const interactivePayload = {
      type: "button",
      body: { text: broadcastText },
      action: {
        buttons: [
          { type: "reply", reply: { id: `flash_buy_${flashSaleId}`, title: "Buy 1Kg ⚡" } }
        ]
      }
    };

    for (const c of customers) {
      if (!c.phone || c.phone.length < 10) continue;
      const targetPhone = '91' + c.phone;
      const localId = await insertPendingRow({
        account, toNumber: targetPhone, messageType: 'interactive', messageBody: broadcastText
      });
      await enqueueSend({
        kind: 'interactive',
        accountId: account.id,
        to: targetPhone,
        localMessageId: localId,
        payload: interactivePayload
      });
    }
  }

  return { ok: true, flashSaleId, targets: customers.length };
}

module.exports = { triggerFlashSale };
