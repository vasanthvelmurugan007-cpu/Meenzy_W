const fs = require('fs');

// PATCH 1: webhook.js
let code = fs.readFileSync('backend/src/routes/webhook.js', 'utf8');

const webhookSearchTarget = `// MEENZY Custom Workflow Rule 3: State Machine Cart Router
        if (r.direction === 'incoming' && r.message_type === 'interactive' && r.selected_button_id) {
          const btnId = r.selected_button_id;
          console.log(\`[meenzy-interactive] Selected Button ID: \${btnId} from customer: \${r.contact_number}\`);
          
          const { resolveAccount } = require('../services/messageSender');
          const { account, error } = await resolveAccount({});
          if (!error && account) {
            const handled = await handleCartState(r.contact_number, account, btnId);
            if (handled) continue;
          }
        }`;

const webhookReplacement = `// MEENZY Custom Workflow Rule 3: State Machine Cart Router
        if (r.direction === 'incoming' && r.message_type === 'interactive' && r.selected_button_id) {
          const btnId = r.selected_button_id;
          console.log(\`[meenzy-interactive] Selected Button ID: \${btnId} from customer: \${r.contact_number}\`);
          
          const { resolveAccount, insertPendingRow } = require('../services/messageSender');
          const { enqueueSend } = require('../queue/sendQueue');
          const { account, error } = await resolveAccount({});
          
          if (!error && account) {
            if (btnId.startsWith('category_') || btnId.startsWith('basefish_')) {
              const catalogId = process.env.MEENZY_CATALOG_ID || "2150289245547170";
              const mpmPayload = await getDynamicMpmPayload(btnId, catalogId, account.accessToken);
              const localId = await insertPendingRow({
                account, toNumber: r.contact_number, messageType: 'interactive', messageBody: 'Sent native catalog list for ' + btnId
              });
              await enqueueSend({
                kind: 'interactive', accountId: account.id, to: String(r.contact_number).replace(/\\D/g, ''), localMessageId: localId, payload: { interactive: mpmPayload }
              });
              continue;
            } else {
              const handled = await handleCartState(r.contact_number, account, btnId);
              if (handled) continue;
            }
          }
        }`;

code = code.replace(webhookSearchTarget, webhookReplacement);
fs.writeFileSync('backend/src/routes/webhook.js', code);
console.log('webhook.js patched');

// PATCH 2: cartManager.js
let cartCode = fs.readFileSync('backend/src/engine/cartManager.js', 'utf8');
cartCode = cartCode.replace(
  "if (incomingPayload.startsWith('CAT_')) {",
  "if (incomingPayload.startsWith('order_')) {"
);
cartCode = cartCode.replace(
  "const productId = incomingPayload.replace('CAT_', '');",
  "const productId = incomingPayload.replace('order_', '');"
);

fs.writeFileSync('backend/src/engine/cartManager.js', cartCode);
console.log('cartManager.js patched');
