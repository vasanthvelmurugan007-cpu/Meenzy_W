const fs = require('fs');

let c = fs.readFileSync('backend/src/routes/webhook.js', 'utf8');

const fetcher = `
// === DYNAMIC CATALOG FETCHER ===
async function fetchCatalogProducts(catalogId, token) {
  try {
    const url = \`https://graph.facebook.com/v19.0/\${catalogId}/products?access_token=\${token}&fields=id,name,description,price&limit=100\`;
    const res = await fetch(url);
    const json = await res.json();
    return json.data || [];
  } catch(e) {
    console.error("FB Fetch Error:", e);
    return [];
  }
}

// Helper to construct dynamic MPM section
async function getDynamicMpmPayload(btnId, catalogId, token) {
  const products = await fetchCatalogProducts(catalogId, token);
  
  let filtered = [];
  let title = "Products";
  let text = "Browse our selections:";
  
  if (btnId === 'category_high_protein') {
    title = "High Protein Fish";
    text = "Browse our protein-rich catches below:";
    filtered = products.filter(p => p.name.toLowerCase().match(/seer|salmon|tuna|snake head|shrimp/));
  } else if (btnId === 'category_boneless') {
    title = "Boneless Cuts";
    text = "Premium boneless cuts, ready to cook:";
    filtered = products.filter(p => p.name.toLowerCase().match(/fillet|boneless|steak/));
  } else if (btnId === 'category_shellfish') {
    title = "Shellfish & Crabs";
    text = "Tiger prawns, crabs, squid, and lobsters:";
    filtered = products.filter(p => p.name.toLowerCase().match(/prawn|crab|squid|lobster|shrimp/));
  } else if (btnId === 'category_biological') {
    title = "Fresh Water & Sea";
    text = "Pelagic, Demersal, and Freshwater catches:";
    filtered = products.filter(p => p.name.toLowerCase().match(/catla|rohu|mackerel|sardine|pomfret/));
  } else if (btnId === 'category_instant_buy') {
    title = "Ready to Cook";
    text = "Steaks, Curry Cuts, and Cleaned:";
    filtered = products.filter(p => p.name.toLowerCase().match(/cleaned|curry cut|peeled/));
  }
  
  const itemsToShow = filtered.length > 0 ? filtered.slice(0, 30) : products.slice(0, 30);
  const productList = itemsToShow.map(p => ({ product_retailer_id: p.id }));

  return {
    type: "product_list",
    header: { type: "text", text: "⚡ " + title },
    body: { text: text },
    action: {
      catalog_id: catalogId,
      sections: [
        {
          title: title,
          product_items: productList
        }
      ]
    }
  };
}
// ===============================

`;

if (!c.includes('fetchCatalogProducts')) {
  c = c.replace('function parseMetaPayload(body) {', fetcher + 'function parseMetaPayload(body) {');
}

// Replace the individual handlers to use the dynamic payload!
const regex = /if\s*\(btnId\s*===\s*'category_high_protein'\)\s*\{[\s\S]*?console\.log\(`\[meenzy-interactive\] Sent Instant Buy MPM to customer: \$\{r\.contact_number\}`\);\s*\}/;

const replacement = `if (btnId.startsWith('category_')) {
            if (!error && account) {
              const catalogId = process.env.MEENZY_CATALOG_ID || "WIX_STUDIO_CATALOG_ID";
              const mpmPayload = await getDynamicMpmPayload(btnId, catalogId, account.accessToken);
              
              const localId = await insertPendingRow({
                account, toNumber: r.contact_number, messageType: 'interactive', messageBody: 'Sent Dynamic ' + btnId
              });
              await enqueueSend({
                kind: 'interactive', accountId: account.id, to: String(r.contact_number).replace(/\\D/g, ''), localMessageId: localId, payload: { interactive: mpmPayload }
              });
              console.log(\`[meenzy-interactive] Sent Dynamic \${btnId} MPM to customer: \${r.contact_number}\`);
            }
          }`;

c = c.replace(regex, replacement);

fs.writeFileSync('backend/src/routes/webhook.js', c);
console.log('Successfully injected dynamic dynamic logic!');
