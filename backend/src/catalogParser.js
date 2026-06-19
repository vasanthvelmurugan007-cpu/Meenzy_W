const fs = require('fs');
const path = require('path');

let catalogMap = null;

function loadCatalog() {
  if (catalogMap) return catalogMap;
  
  catalogMap = {};
  try {
    const filePath = path.join(__dirname, 'catalog_products.csv');
    if (!fs.existsSync(filePath)) return catalogMap;
    
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    let currentProductName = '';
    let currentHandle = '';
    
    // A simple CSV split that handles quotes
    const parseLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && line[i+1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current);
      return result;
    };
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = parseLine(line);
      const handle = parts[0];
      const type = parts[1];
      
      if (type === 'PRODUCT') {
        currentHandle = handle;
        // The name in CSV is something like "Anchovy / Nethili - (𝗚𝗿𝗼𝘀𝘀: 𝟴𝟱𝟬𝗴, 𝗡𝗲𝘁: 𝟱𝟬𝟬𝗴)"
        // We'll clean it up to just the base names
        let rawName = parts[2] || '';
        const dashIndex = rawName.indexOf('-');
        if (dashIndex > -1) {
          rawName = rawName.substring(0, dashIndex);
        }
        currentProductName = rawName.trim();
        
        let cuts = [];
        const cutIdx = parts.indexOf('Cutting style:');
        if (cutIdx > -1 && parts.length > cutIdx + 2) {
           cuts = parts[cutIdx + 2].split(';').map(s => s.trim()).filter(Boolean);
        }
        
        if (!catalogMap[currentProductName]) {
            catalogMap[currentProductName] = {
                name: currentProductName,
                pricePerKg: 0,
                cutOptions: cuts,
                imageUrl: null
            };
        } else {
            catalogMap[currentProductName].cutOptions = cuts;
        }
      } else if (type === 'VARIANT' && handle === currentHandle) {
        const price = parseFloat(parts[11]);
        if (!isNaN(price)) {
          // Assume price is for 0.5 Kg as seen in CSV, so price_in_inr (per kg) = price * 2
          // But wait, some are 1 Kg! Let's check the weight column.
          // In the CSV, weight is near the end, let's just find "0.5 Kg" or "1 Kg"
          const rowStr = line.toLowerCase();
          let multiplier = 2; // Default to 0.5kg
          if (rowStr.includes('1 kg') && !rowStr.includes('0.5 kg')) {
            multiplier = 1;
          }
          
        const pricePerKg = price * multiplier;
          
        if (catalogMap[currentProductName].pricePerKg === 0 || pricePerKg < catalogMap[currentProductName].pricePerKg) {
            catalogMap[currentProductName].pricePerKg = pricePerKg;
        }
        }
      } else if (type === 'MEDIA' && handle === currentHandle) {
        if (!catalogMap[currentProductName].imageUrl) {
          const mediaFile = parts[7];
          if (mediaFile && mediaFile.trim() !== '') {
            catalogMap[currentProductName].imageUrl = `https://static.wixstatic.com/media/${mediaFile.trim()}`;
          }
        }
      }
    }
    
    console.log(`[catalogParser] Loaded ${Object.keys(catalogMap).length} products from CSV`);
  } catch (err) {
    console.error('[catalogParser] Error loading catalog:', err.message);
  }
  
  return catalogMap;
}

function getPriceForExtractedItem(itemName) {
  const catalog = loadCatalog();
  if (!catalog) return 0;
  
  const query = itemName.toLowerCase();
  
  for (const key of Object.keys(catalog)) {
    const baseNames = key.toLowerCase().split('/').map(s => s.trim());
    if (baseNames.some(n => query.includes(n) || n.includes(query))) {
      return catalog[key].pricePerKg;
    }
  }
  return 0; // Unknown
}

function getCutOptionsForExtractedItem(itemName) {
  const catalog = loadCatalog();
  if (!catalog) return [];
  
  const query = itemName.toLowerCase();
  
  for (const key of Object.keys(catalog)) {
    const baseNames = key.toLowerCase().split('/').map(s => s.trim());
    if (baseNames.some(n => query.includes(n) || n.includes(query))) {
      return catalog[key].cutOptions || [];
    }
  }
  return [];
}

function getImageUrlForExtractedItem(itemName) {
  const catalog = loadCatalog();
  if (!catalog) return null;
  
  const query = itemName.toLowerCase();
  
  for (const key of Object.keys(catalog)) {
    const baseNames = key.toLowerCase().split('/').map(s => s.trim());
    if (baseNames.some(n => query.includes(n) || n.includes(query))) {
      return catalog[key].imageUrl || null;
    }
  }
  return null;
}

module.exports = {
  loadCatalog,
  getPriceForExtractedItem,
  getCutOptionsForExtractedItem,
  getImageUrlForExtractedItem
};
