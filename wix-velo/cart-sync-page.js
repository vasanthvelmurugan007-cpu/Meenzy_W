// ============================================================
// FILE: cart-sync-page.js  (UPDATED VERSION)
// WHERE TO PUT IT: Wix Editor → Pages → Cart Sync → Page Code panel
// ============================================================

import wixLocation from 'wix-location';
import { getCartByToken } from 'backend/getCartItems'; // Ensure getCartItems is saved as .jsw
import { cart } from 'wix-stores-frontend';

$w.onReady(async function () {
  setStatus('🛒 Loading your cart, please wait...');

  const token = wixLocation.query['cart_token'];

  if (!token) {
    setStatus('❌ Invalid cart link. Please contact us on WhatsApp for a new link.');
    return;
  }

  try {
    // Call backend to look up cart
    const result = await getCartByToken(token);

    if (!result.ok || !result.items || result.items.length === 0) {
      setStatus('⏰ This cart link has expired or is invalid. Please place a new order on WhatsApp.');
      return;
    }

    const items = result.items;

    setStatus('✅ Adding items to your cart...');

    // Add items using frontend API so it binds to the current browser session
    const productsToAdd = items.map(item => ({
      productId: item.productId,
      quantity: item.quantity || 1
    }));

    cart.addProducts(productsToAdd)
      .then((updatedCart) => {
        setStatus('🎉 Cart ready! Redirecting to checkout...');
        setTimeout(() => {
          wixLocation.to('/cart');
        }, 1500);
      })
      .catch((error) => {
        console.error('[CartSync] Frontend add to cart failed:', error);
        setStatus('❌ Could not add items to cart. Please try again.');
      });

  } catch (err) {
    console.error('[CartSync] Error:', err);
    setStatus('❌ Something went wrong. Please contact us on WhatsApp.');
  }
});

function setStatus(message) {
  try { $w('#statusText').text = message; } catch (e) {}
}
