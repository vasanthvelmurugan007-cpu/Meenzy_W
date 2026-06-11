const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/webhook.js', 'utf8');

// 1. Add cartManager import
if (!code.includes("require('../engine/cartManager')")) {
  code = code.replace(
    "const catalogProducts = require('../catalogData');",
    "const catalogProducts = require('../catalogData');\nconst { updateCartQuantity, sendUpdatedCartView } = require('../engine/cartManager');"
  );
}

// 2. Add C_INC, C_DEC, and C_CHECKOUT handlers
const handlerInjectionRegex = /\} else if \(btnId === 'view_cart' \|\| btnId === 'add_more_fish'\) \{/;

const newHandlers = `} else if (btnId.startsWith('C_INC:')) {
            const productId = btnId.replace('C_INC:', '');
            await updateCartQuantity(r.contact_number, productId, 'INCREASE', 0.5);
            if (!error && account) await sendUpdatedCartView(r.contact_number, account, productId);
          } else if (btnId.startsWith('C_DEC:')) {
            const productId = btnId.replace('C_DEC:', '');
            await updateCartQuantity(r.contact_number, productId, 'DECREASE', 0.5);
            if (!error && account) await sendUpdatedCartView(r.contact_number, account, productId);
          } else if (btnId === 'C_CHECKOUT') {
            const tempCartRes = await client.query(\`SELECT cart_items FROM coexistence.meenzy_carts WHERE whatsapp_id = $1\`, [r.contact_number]);
            if (tempCartRes.rows.length > 0 && tempCartRes.rows[0].cart_items.length > 0) {
              const items = tempCartRes.rows[0].cart_items;
              let grandTotal = 0;
              const summaryLines = [];
              for (const item of items) {
                await client.query(
                  \`INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status)
                   VALUES ($1, $2, $3, 'PENDING_CONFIRMATION')\`,
                  [r.contact_number, item.base_name, item.quantity]
                );
                const lineTotal = item.quantity * item.price_per_kg;
                grandTotal += lineTotal;
                summaryLines.push(\`• \${item.base_name} (\${item.quantity} Kg) — ₹\${lineTotal}\`);
              }
              // Clear cart
              await client.query(\`UPDATE coexistence.meenzy_carts SET cart_items = '[]'::jsonb WHERE whatsapp_id = $1\`, [r.contact_number]);
              
              if (!error && account) {
                const text = \`🎉 *Order Registered!* 🎉\\n\\n*Your Order:*\\n\${summaryLines.join('\\n')}\\n\\n💰 *Total: ₹\${grandTotal}*\\n\\nOnce we verify availability in today's fresh market catch, we will confirm and notify you! Thank you! 🍽️\`;
                const { enqueueSend } = require('../queue/sendQueue');
                const { insertPendingRow } = require('../services/messageSender');
                const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'text', messageBody: text });
                await enqueueSend({ kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
              }
            }
          } else if (btnId === 'view_cart' || btnId === 'add_more_fish') {`;

code = code.replace(handlerInjectionRegex, newHandlers);

// 3. Update the `order_` button to start using the new C_INC payload instead of addqty_
const oldOrderPayloadRegex = /\{ type: "reply", reply: \{ id: \`addqty_0\.5_\$\{productId\}\`, title: "\+ 0\.5 Kg" \} \},\n\s*\{ type: "reply", reply: \{ id: \`addqty_1\.0_\$\{productId\}\`, title: "\+ 1\.0 Kg" \} \},\n\s*\{ type: "reply", reply: \{ id: "view_cart", title: "View Cart 🛒" \} \}/;

const newOrderPayload = `{ type: "reply", reply: { id: \`C_INC:\${productId.substring(0, 18)}\`, title: "+ 0.5 Kg" } }`;

code = code.replace(oldOrderPayloadRegex, newOrderPayload);

fs.writeFileSync('backend/src/routes/webhook.js', code);
console.log('Successfully injected Custom Cart handlers into webhook.js');
