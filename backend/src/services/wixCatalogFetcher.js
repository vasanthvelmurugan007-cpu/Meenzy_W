function parseTSV(text) {
  const result = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i+1];
    
    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === '\t') {
        row.push(field);
        field = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && next === '\n') {
          i++;
        }
        row.push(field);
        result.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    result.push(row);
  }
  return result;
}

let cachedCatalog = null;
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchCatalogProducts() {
  if (cachedCatalog && (Date.now() - lastFetchTime < CACHE_TTL)) {
    return cachedCatalog;
  }

  try {
    const feedUrl = process.env.WIX_FEED_URL;
    if (!feedUrl) {
      console.error("[meenzy-wix-fetch] WIX_FEED_URL missing in env!");
      return cachedCatalog || [];
    }
    
    console.log(`[meenzy-wix-fetch] Sourcing products from Wix Facebook TSV feed...`);
    const res = await fetch(feedUrl);
    const text = await res.text();
    const rows = parseTSV(text);
    if (rows.length < 2) {
      console.error("[meenzy-wix-fetch] TSV feed is empty or invalid format.");
      return cachedCatalog || [];
    }
    
    const headers = rows[0];
    const items = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < headers.length) continue;
      const item = {};
      headers.forEach((h, idx) => {
        item[h] = row[idx];
      });
      if (item.id && item.title && item.availability === 'in stock') {
        items.push(item);
      }
    }
    
    // Group by item_group_id (Wix Product ID) or title to get unique products
    // Selecting the first variant of each product as representative
    const productMap = new Map();
    for (const item of items) {
      const key = item.item_group_id && item.item_group_id !== "undefined" ? item.item_group_id : item.title.trim();
      
      if (!productMap.has(key)) {
        productMap.set(key, item);
      } else {
        // Prefer variants with Weight "1 Kg" or "1kg" or first option if possible
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
      productId: item.item_group_id,
      name: item.title || "",
      description: item.description || "",
      price: String(item.price || "0").replace(/[^0-9.]/g, ''), // Strip "INR" or "₹" if any
      retailer_id: item.id,
      image_url: item.image_link || item.image_url || ''
    }));
    
    cachedCatalog = uniqueProducts;
    lastFetchTime = Date.now();
    return uniqueProducts;
  } catch (e) {
    console.error("[meenzy-wix-fetch] Wix TSV Fetch Error:", e);
    return cachedCatalog || [];
  }
}

async function getProductImageByName(productName) {
  if (!cachedCatalog) {
    await fetchCatalogProducts();
  }
  if (!cachedCatalog) return null;
  
  // Match as generously as possible
  const target = productName.toLowerCase().trim();
  const found = cachedCatalog.find(p => p.name.toLowerCase().includes(target));
  return found ? found.image_url : null;
}

module.exports = {
  fetchCatalogProducts,
  getProductImageByName
};
