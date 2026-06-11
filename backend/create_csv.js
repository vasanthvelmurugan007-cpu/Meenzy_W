const fs = require('fs');

async function fetchCatalogProducts() {
  const url = 'https://manage.wix.com/catalog-feed/v1/feed.tsv?marketplace=facebook&version=1&token=f950%2BIB%2BW%2BKB%2FBpXWTICi7%2FRmEcSomY7eeQB7u4Cr1jUWs4pStPyKF%2BTAcxdBoTH';
  try {
    const res = await fetch(url);
    const text = await res.text();
    
    const lines = text.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return [];
    
    const headers = lines[0].split('\t').map(h => h.trim());
    const productMap = new Map();
    
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split('\t');
      const item = {};
      headers.forEach((h, idx) => {
        item[h] = row[idx] ? row[idx].trim() : '';
      });
      
      const key = item.item_group_id || item.id;
      if (!key) continue;
      
      if (!productMap.has(key)) {
        productMap.set(key, item);
      } else {
        const current = productMap.get(key);
        const has1Kg = item.title.toLowerCase().includes("1 kg") || item.size?.toLowerCase().includes("1 kg");
        const currentHas1Kg = current.title.toLowerCase().includes("1 kg") || current.size?.toLowerCase().includes("1 kg");
        if (has1Kg && !currentHas1Kg) {
          productMap.set(key, item);
        }
      }
    }
    
    const uniqueProducts = Array.from(productMap.values()).map(item => ({
      id: item.id,
      name: item.title || "",
      price: String(item.price || "0").replace(/[^0-9.]/g, '')
    }));
    
    return uniqueProducts;
  } catch (e) {
    console.error(e);
    return [];
  }
}

fetchCatalogProducts().then(products => {
  let csvContent = "ID,Product Name,Price\n";
  products.forEach(p => {
    // Escape commas in names
    const safeName = `"${p.name.replace(/"/g, '""')}"`;
    csvContent += `${p.id},${safeName},${p.price}\n`;
  });
  fs.writeFileSync('../meenzy_fishes.csv', csvContent);
  console.log('Created meenzy_fishes.csv with ' + products.length + ' products.');
});
