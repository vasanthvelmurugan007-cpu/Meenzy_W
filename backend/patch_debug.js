const fs = require('fs');

let code = fs.readFileSync('backend/src/routes/webhook.js', 'utf8');

const webhookSearchTarget = `if (btnId.startsWith('category_') || btnId.startsWith('basefish_')) {
              const catalogId = process.env.MEENZY_CATALOG_ID || "2150289245547170";
              const mpmPayload = await getDynamicMpmPayload(btnId, catalogId, account.accessToken);
              const localId = await insertPendingRow({
                account, toNumber: r.contact_number, messageType: 'interactive', messageBody: 'Sent native catalog list for ' + btnId
              });
              await enqueueSend({
                kind: 'interactive', accountId: account.id, to: String(r.contact_number).replace(/\\D/g, ''), localMessageId: localId, payload: { interactive: mpmPayload }
              });
              continue;
            }`;

const webhookReplacement = `if (btnId.startsWith('category_') || btnId.startsWith('basefish_')) {
              console.log('[DEBUG] category_ block entered for btnId:', btnId);
              try {
                const catalogId = process.env.MEENZY_CATALOG_ID || "2150289245547170";
                console.log('[DEBUG] Calling getDynamicMpmPayload...');
                const mpmPayload = await getDynamicMpmPayload(btnId, catalogId, account.accessToken);
                console.log('[DEBUG] getDynamicMpmPayload returned payload title:', mpmPayload.header?.text);
                const localId = await insertPendingRow({
                  account, toNumber: r.contact_number, messageType: 'interactive', messageBody: 'Sent native catalog list for ' + btnId
                });
                console.log('[DEBUG] Calling enqueueSend...');
                await enqueueSend({
                  kind: 'interactive', accountId: account.id, to: String(r.contact_number).replace(/\\D/g, ''), localMessageId: localId, payload: { interactive: mpmPayload }
                });
                console.log('[DEBUG] enqueueSend finished successfully!');
              } catch (err) {
                console.error('[DEBUG] ERROR in category_ block:', err);
              }
              continue;
            }`;

code = code.replace(webhookSearchTarget, webhookReplacement);
fs.writeFileSync('backend/src/routes/webhook.js', code);
console.log('debug patch applied');
