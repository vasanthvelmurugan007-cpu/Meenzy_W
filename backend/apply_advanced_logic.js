const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/webhook.js', 'utf8');

// 1. Add imports and Helper Functions at top
const helpers = `
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy_key");

// === Cart Abandonment Tracking ===
async function updateTemporaryCart(client, phone, item, quantity, step = 'building_cart') {
  try {
    await client.query(\`
      INSERT INTO coexistence.meenzy_temporary_carts (whatsapp_id, cart_json, current_step, updated_at)
      VALUES ($1, jsonb_build_object($2::text, $3::numeric), $4, NOW())
      ON CONFLICT (whatsapp_id) DO UPDATE SET
        cart_json = coexistence.meenzy_temporary_carts.cart_json || jsonb_build_object($2::text, $3::numeric),
        current_step = EXCLUDED.current_step,
        updated_at = NOW()
    \`, [phone, item || 'viewing_cart', quantity || 0, step]);
  } catch (err) {
    console.error('[cart-tracking] Error updating cart:', err.message);
  }
}

// === Cross Sell ===
function getCrossSellRecommendation(cartItems) {
  const hasRawFish = cartItems.some(i => i.ordered_item && i.ordered_item.match(/seer|tuna|salmon|prawn|pomfret|rohu/i));
  const hasSpices = cartItems.some(i => i.ordered_item && i.ordered_item.match(/masala|marinade|spice/i));
  if (hasRawFish && !hasSpices) {
    return {
      title: "Meenzy Special Fish Fry Masala",
      price: 50,
      id: "upsell_masala_01",
      message: "🔥 Complete your meal! Add our signature Meenzy Fish Fry Masala (₹50) to perfectly complement your fresh catch?"
    };
  }
  return null;
}

// === LLM Triage ===
async function triageWithLLM(messageText) {
  try {
    if (!process.env.GEMINI_API_KEY) return 'GENERAL_FAQ';
    const prompt = \`You are an AI assistant for Meenzy Fresh Seafood. Classify the user's intent into EXACTLY ONE of these categories:
- PLACING_ORDER (User wants to buy something)
- ORDER_COMPLAINT (User is unhappy, missing items, bad quality)
- DELIVERY_QUERY (User is asking when it arrives)
- GENERAL_FAQ (Business hours, location, cleaning process)
Message: "\${messageText}"
Output ONLY the exact category name.\`;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch(e) {
    console.error('[llm-triage] Error:', e.message);
    return 'GENERAL_FAQ';
  }
}
`;

if (!code.includes('updateTemporaryCart')) {
  code = code.replace('const catalogProducts = require(\'../catalogData\');', 'const catalogProducts = require(\'../catalogData\');\n' + helpers);
}

// 2. Inject updateTemporaryCart calls
code = code.replace(
  /await client\.query\(\s*\`INSERT INTO coexistence\.meenzy_preorders \(customer_phone, ordered_item, quantity, order_status\)\s*VALUES \(\$1, \$2, \$3, 'INCART'\)\`,\s*\[r\.contact_number, product\.name, qty\]\s*\);/,
  `await client.query(
                \`INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status)
                 VALUES ($1, $2, $3, 'INCART')\`,
                [r.contact_number, product.name, qty]
              );
              await updateTemporaryCart(client, r.contact_number, product.name, qty, 'building_cart');`
);

// 3. Inject Upsell logic in checkout
const originalCheckout = `          } else if (btnId === 'checkout_cart') {
            // Fetch cart summary before confirming`;

const newCheckout = `          } else if (btnId === 'checkout_cart' || btnId === 'skip_upsell' || btnId.startsWith('add_upsell_')) {
            if (btnId.startsWith('add_upsell_')) {
              await client.query(
                \`INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status)
                 VALUES ($1, 'Meenzy Special Fish Fry Masala', 1, 'INCART')\`,
                [r.contact_number]
              );
              await updateTemporaryCart(client, r.contact_number, 'Meenzy Special Fish Fry Masala', 1, 'upsell_resolved');
            } else if (btnId === 'skip_upsell') {
              await updateTemporaryCart(client, r.contact_number, null, null, 'upsell_resolved');
            }
            
            const checkoutCartRes = await client.query(
              \`SELECT p.ordered_item, SUM(p.quantity) as total_qty, c.price_in_inr
               FROM coexistence.meenzy_preorders p
               LEFT JOIN coexistence.meenzy_catalog c ON p.ordered_item ILIKE c.item_name
               WHERE p.customer_phone = $1 AND p.order_status = 'INCART'
               GROUP BY p.ordered_item, c.price_in_inr\`,
              [r.contact_number]
            );
            
            if (btnId === 'checkout_cart') {
              const upsell = getCrossSellRecommendation(checkoutCartRes.rows);
              const tempCartRes = await client.query(\`SELECT current_step FROM coexistence.meenzy_temporary_carts WHERE whatsapp_id = $1\`, [r.contact_number]);
              const currentStep = tempCartRes.rows[0]?.current_step;
              
              if (upsell && currentStep !== 'upsell_offered' && currentStep !== 'upsell_resolved') {
                const { resolveAccount, insertPendingRow } = require('../services/messageSender');
                const { enqueueSend } = require('../queue/sendQueue');
                const { account, error } = await resolveAccount({});
                if (!error && account) {
                  const payload = {
                    type: "button",
                    body: { text: upsell.message },
                    action: {
                      buttons: [
                        { type: "reply", reply: { id: \`add_upsell_\${upsell.id}\`, title: "Yes, Add It! 🌶️" } },
                        { type: "reply", reply: { id: "skip_upsell", title: "No thanks" } }
                      ]
                    }
                  };
                  await updateTemporaryCart(client, r.contact_number, null, null, 'upsell_offered');
                  const localId = await insertPendingRow({
                    account, toNumber: r.contact_number, messageType: 'interactive', messageBody: upsell.message
                  });
                  await enqueueSend({
                    kind: 'interactive', accountId: account.id, to: String(r.contact_number).replace(/\\D/g, ''), localMessageId: localId, payload: { interactive: payload }
                  });
                }
                continue; // Pause checkout flow
              }
            }
            
            // Mark completed
            await updateTemporaryCart(client, r.contact_number, null, null, 'completed');
            
            // Proceed with original checkout logic...`;

code = code.replace(originalCheckout, newCheckout);


// 4. LLM Triage Block
const llmTriageRegex = /        \/\/ MEENZY Custom Workflow Rule 5: Inbound Swap Fish Choice Parser\n        if \(r\.direction === 'incoming' && r\.message_body\) \{\n          const trimmedBody = r\.message_body\.trim\(\);\n          if \(\/\^swap\/i\.test\(trimmedBody\)\) \{/;

const triageCode = `        // MEENZY Custom Workflow Rule 5: LLM Triage and Swap parser
        if (r.direction === 'incoming' && r.message_body) {
          const trimmedBody = r.message_body.trim();
          
          if (/^swap/i.test(trimmedBody)) {
`;
code = code.replace(llmTriageRegex, triageCode);

const llmTriageEndRegex = /                \}\n              \}\n            \}\n          \}\n        \}\n      \}\n\n      await client\.query\('COMMIT'\);/

const triageEnd = `                }
              }
            }
            r.__handled = true; // prevent evaluateTriggers
          } else {
             // Not SWAP, let's LLM triage
             if (!r.__handled) {
               const intent = await triageWithLLM(trimmedBody);
               if (intent === 'ORDER_COMPLAINT') {
                 await client.query(\`
                   UPDATE coexistence.contacts 
                   SET tags = tags || '[{"id": 999, "name": "CRM_Followup", "color": "#ef4444"}]'::jsonb, updated_at = NOW()
                   WHERE contact_number = $1
                 \`, [r.contact_number]);
                 
                 const { resolveAccount, insertPendingRow } = require('../services/messageSender');
                 const { enqueueSend } = require('../queue/sendQueue');
                 const { account, error } = await resolveAccount({});
                 if (!error && account) {
                   const text = "We are so sorry to hear you're experiencing an issue! 😔 We have flagged this as high priority and a senior manager will review it and message you shortly.";
                   const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'text', messageBody: text });
                   await enqueueSend({ kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
                 }
                 console.log(\`[llm-triage] Flagged ORDER_COMPLAINT for \${r.contact_number}\`);
                 r.__handled = true;
               } else if (intent === 'PLACING_ORDER') {
                 const { resolveAccount, insertPendingRow } = require('../services/messageSender');
                 const { enqueueSend } = require('../queue/sendQueue');
                 const { account, error } = await resolveAccount({});
                 if (!error && account) {
                   const listPayload = {
                     type: "list",
                     body: { text: "It looks like you'd like to place an order! Please click below to view our live catalog." },
                     action: {
                       button: "View Catalog",
                       sections: [{ title: "Seafood", rows: [{ id: "category_all", title: "🐟 View Catalog", description: "Browse all items" }] }]
                     }
                   };
                   const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'interactive', messageBody: 'LLM Triage: Order link' });
                   await enqueueSend({ kind: 'interactive', accountId: account.id, to: String(r.contact_number).replace(/\\D/g, ''), localMessageId: localId, payload: { interactive: listPayload } });
                 }
                 r.__handled = true;
               }
             }
          }
        }
      }

      await client.query('COMMIT');`;

code = code.replace(llmTriageEndRegex, triageEnd);

// Mark handled for existing rules to prevent LLM triage trigger
code = code.replace(/console\.log\(\`\[meenzy-preorder\] Sent registration confirmation to: \$\{r\.contact_number\}\`\);\n              \}/, `console.log(\`[meenzy-preorder] Sent registration confirmation to: \${r.contact_number}\`);\n              }\n              r.__handled = true;`);
code = code.replace(/console\.log\(\`\[meenzy-welcome\] Successfully enqueued welcome category list response for: \$\{r\.contact_number\}\`\);\n            \}/, `console.log(\`[meenzy-welcome] Successfully enqueued welcome category list response for: \${r.contact_number}\`);\n            }\n            r.__handled = true;`);

// Skip evaluateTriggers if __handled is true
code = code.replace(/const incomingRecords = allRecords.filter\(r => r.direction === 'incoming' && r.message_type !== 'status' && r.message_type !== 'reaction'\);/, `const incomingRecords = allRecords.filter(r => r.direction === 'incoming' && r.message_type !== 'status' && r.message_type !== 'reaction' && !r.__handled);`);

fs.writeFileSync('backend/src/routes/webhook.js', code);
console.log('Successfully injected advanced logic into webhook.js!');
