const http = require('http');

const payload = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{
    id: "862029628",
    changes: [{
      value: {
        messaging_product: "whatsapp",
        metadata: {
          display_phone_number: "15551234567",
          phone_number_id: "104245645511520"
        },
        contacts: [{ profile: { name: "Simulated User" }, wa_id: "919845444003" }],
        messages: [{
          from: "919845444003",
          id: "wamid.simulated_123456",
          timestamp: Math.floor(Date.now() / 1000).toString(),
          type: "interactive",
          interactive: {
            type: "button_reply",
            button_reply: { id: "category_high_protein", title: "High Protein" }
          }
        }]
      },
      field: "messages"
    }]
  }]
});

const options = {
  hostname: 'localhost',
  port: 80,
  path: '/api/webhook/whatsapp',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = http.request(options, res => {
  console.log('Status:', res.statusCode);
  res.on('data', d => process.stdout.write(d));
});
req.on('error', e => console.error(e));
req.write(payload);
req.end();
