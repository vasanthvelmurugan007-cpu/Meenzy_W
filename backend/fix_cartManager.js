const fs = require('fs');

let content = fs.readFileSync('backend/src/engine/cartManager.js', 'utf8');

// The write_to_file tool literally wrote backslashes before backticks and dollars.
content = content.replace(/\\\`/g, '\`');
content = content.replace(/\\\$/g, '\$');

fs.writeFileSync('backend/src/engine/cartManager.js', content);

let content2 = fs.readFileSync('backend/src/routes/webhook.js', 'utf8');
content2 = content2.replace(/\\\`/g, '\`');
content2 = content2.replace(/\\\$/g, '\$');
fs.writeFileSync('backend/src/routes/webhook.js', content2);

console.log('Fixed syntax errors.');
