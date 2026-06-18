// ============================================================
// FILE: cart-sync-page.js
// WHERE TO PUT IT: Wix Editor → Pages → Cart Sync page → Page Code panel
//
// SETUP:
//  1. Add a new Page: named "Cart Sync", URL slug = /cart-sync
//  2. Hide from navigation (right-click page → Hide from Menu)
//  3. Add a Text element with ID: #statusText  (e.g. "Loading your cart...")
//  4. Optionally add a loading spinner image with ID: #loadingSpinner
//  5. Paste this code in the Page Code panel at the bottom
//  6. Publish the site
//
// CUSTOMER URL FORMAT:
//   https://www.meenzy.com/cart-sync?cart_token=TOKEN
// ============================================================

import wixData from 'wix-data';
import { currentCart } from 'wix-ecom-backend';
import wixLocation from 'wix-location';

// Wix Stores internal App ID — do NOT change this
const WIX_STORES_APP_ID = '215238eb-22a5-4c36-9e7b-41cce8e2a9e8';

$w.onReady(async function () {
  // --- Show loading state ---
  try { $w('#statusText').text = '🛒 Loading your cart, please wait...'; } catch(e) {}
  try { $w('#loadingSpinner').show(); } catch(e) {}

  // --- Read cart_token from URL query string ---
  const token = wixLocation.query['cart_token'];

  if (!token) {
    setStatus('❌ Invalid cart link. Please contact us on WhatsApp for a new link.');
    return;
  }

  try {
    // --- Look up the cart record in the WhatsAppCarts CMS collection ---
    const results = await wixData.query('WhatsAppCarts')
      .eq('token', token)
      .find({ suppressAuth: true });

    if (!results.items || results.items.length === 0) {
      setStatus('⏰ This cart link has expired or is invalid. Please place a new order on WhatsApp.');
      return;
    }

    const record = results.items[0];

    // --- Parse items ---
    let items;
    try {
      items = typeof record.items === 'string' ? JSON.parse(record.items) : record.items;
    } catch (parseErr) {
      setStatus('❌ Could not read cart items. Please contact support.');
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      setStatus('❌ Your cart is empty. Please place a new order on WhatsApp.');
      return;
    }

    // --- Build line items for Wix cart ---
    // Each item must have { productId: "WIX_PRODUCT_ID", quantity: N }
    const lineItems = items.map(item => ({
      catalogReference: {
        catalogItemId: item.productId,
        appId: WIX_STORES_APP_ID,
        // Optional: pass variant if needed
        // options: { variantId: item.variantId }
      },
      quantity: item.quantity || 1
    }));

    setStatus('✅ Adding items to your cart...');

    // --- Add items to the Wix current cart ---
    await currentCart.addToCurrentCart({ lineItems });

    setStatus('🎉 Cart ready! Redirecting to checkout...');

    // Optional: Delete the cart record after use to keep CMS clean
    try {
      await wixData.remove('WhatsAppCarts', record._id, { suppressAuth: true });
    } catch (cleanupErr) {
      // Non-fatal: log but don't fail
      console.warn('[CartSync] Cleanup error:', cleanupErr);
    }

    // --- Redirect to cart/checkout page ---
    // You can change '/cart' to '/checkout' if you want to skip the cart page
    setTimeout(() => {
      wixLocation.to('/cart');
    }, 1500);

  } catch (err) {
    console.error('[CartSync] Error:', err);
    setStatus('❌ Something went wrong loading your cart. Please contact us on WhatsApp.');
  }
});

/**
 * Helper to update the status text element on the page.
 * Create a Text element in Wix Editor with ID: statusText
 */
function setStatus(message) {
  try { $w('#statusText').text = message; } catch (e) {}
  try { $w('#loadingSpinner').hide(); } catch (e) {}
}
