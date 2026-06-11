const fs = require('fs');
fetch('http://localhost/api/webhook/whatsapp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: fs.readFileSync('test_webhook.json', 'utf8')
}).then(r => r.text()).then(console.log).catch(console.error);
