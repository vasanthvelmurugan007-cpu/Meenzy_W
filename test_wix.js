const payload = {
  "data": {
    "billingInfo": {
      "contactDetails": {
        "phone": "9845444003"
      }
    },
    "lineItems": [
      {
        "itemName": "White Prawn",
        "price": { "value": "575.00" }
      }
    ],
    "number": "10003",
    "priceSummary": {
      "total": { "value": "575.00" }
    }
  }
};

fetch('https://here-batman-plans-fitted.trycloudflare.com/api/webhook/wix-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
})
  .then(res => res.json())
  .then(data => console.log('Response:', data))
  .catch(err => console.error('Error:', err));
