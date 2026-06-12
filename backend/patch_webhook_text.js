const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/webhook.js', 'utf8');

// 1. Add handleFreeformText to the import
code = code.replace(
  "const { handleCartState } = require('../engine/cartManager');",
  "const { handleCartState, handleFreeformText } = require('../engine/cartManager');"
);

// 2. Add handleFreeformText hook inside the text processing block
const searchTarget = "if (r.direction === 'incoming' && r.message_body) {\n          const trimmedBody = r.message_body.trim().toLowerCase();";
const replacement = searchTarget + `
          const { resolveAccount } = require('../services/messageSender');
          const { account, error } = await resolveAccount({});
          if (!error && account) {
            const handled = await handleFreeformText(r.contact_number, account, r.message_body);
            if (handled) continue;
          }
`;

code = code.replace(searchTarget, replacement);
fs.writeFileSync('backend/src/routes/webhook.js', code);
console.log('webhook.js patched with text handling');
