const fs = require('fs');
let code = fs.readFileSync('backend/src/routes/webhook.js', 'utf8');

// 1. Replace imports
code = code.replace(
  "const { updateCartQuantity, sendUpdatedCartView } = require('../engine/cartManager');",
  "const { handleCartState } = require('../engine/cartManager');"
);

// 2. Replace Interactive Matrix
const startMarker = "// MEENZY Custom Workflow Rule 3: Interactive Button Response Switch Matrix";
const startIdx = code.indexOf(startMarker);
if (startIdx === -1) {
  console.log('Start marker not found');
  process.exit(1);
}

// Find the if block `if (r.direction === 'incoming' && r.message_type === 'interactive' && r.selected_button_id) {`
const ifIdx = code.indexOf('if (r.direction === \'incoming\' && r.message_type === \'interactive\' && r.selected_button_id)', startIdx);
if (ifIdx === -1) {
  console.log('If block not found');
  process.exit(1);
}

// Balance brackets to find the end of the if block
let depth = 0;
let endIdx = -1;
let started = false;
for (let i = ifIdx; i < code.length; i++) {
  if (code[i] === '{') {
    depth++;
    started = true;
  } else if (code[i] === '}') {
    depth--;
    if (started && depth === 0) {
      endIdx = i + 1;
      break;
    }
  }
}

if (endIdx === -1) {
  console.log('End of if block not found');
  process.exit(1);
}

const replacement = `// MEENZY Custom Workflow Rule 3: State Machine Cart Router
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

code = code.substring(0, startIdx) + replacement + code.substring(endIdx);

fs.writeFileSync('backend/src/routes/webhook.js', code);
console.log('webhook.js updated successfully!');
