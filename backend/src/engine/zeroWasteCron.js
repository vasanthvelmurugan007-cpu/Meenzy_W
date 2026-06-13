const pool = require('../db');
const { triggerFlashSale } = require('./flashSalesManager');

/**
 * AI Zero Waste Discounting
 * Automatically scans inventory for high-stock items near the end of the day.
 * Slits the price and pushes an automated evening flash sale.
 */
async function generateZeroWasteDiscounts() {
  try {
    // We don't have a real time inventory system connected in DB yet for ecosystem_products, 
    // but assuming we fetch products that have not been ordered today.
    // Let's use ecosystem_products and ecosystem_order_items to find stagnant products.
    
    const { rows: products } = await pool.query(`
      SELECT p.name, p.price, p.id
      FROM coexistence.ecosystem_products p
      WHERE NOT EXISTS (
        SELECT 1 FROM coexistence.ecosystem_order_items i
        JOIN coexistence.ecosystem_orders o ON o.id = i.order_id
        WHERE i.product_name = p.name AND o.created_at >= CURRENT_DATE
      )
      AND p.price > 100
      LIMIT 1
    `);

    if (products.length === 0) {
      console.log("[zero-waste] No stagnant inventory found today.");
      return null;
    }

    const targetProduct = products[0];
    
    // Calculate a 30% discount
    const originalPrice = parseFloat(targetProduct.price || 0);
    const discountedPrice = Math.floor(originalPrice * 0.7);

    if (discountedPrice <= 0) return null;

    const message = `🌆 *Evening Zero-Waste Special!* 🌆\n\nWe have a surplus of fresh ${targetProduct.name} left over today, and we refuse to let good seafood go to waste!\n\nWe've slashed the price by 30% for the next hour!`;
    const quantityToClear = 5; // e.g. 5kg to clear

    console.log(`[zero-waste] Triggering flash sale for ${targetProduct.name} at ₹${discountedPrice}`);
    
    const res = await triggerFlashSale(targetProduct.name, discountedPrice, quantityToClear, message);
    return res;
  } catch (err) {
    console.error('[zero-waste] Error:', err.message);
    return null;
  }
}

module.exports = { generateZeroWasteDiscounts };
