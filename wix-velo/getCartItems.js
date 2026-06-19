// ============================================================
// FILE: backend/getCartItems.jsw (Wix Backend Web Module)
// WHERE TO PUT IT: Wix Editor → Dev Mode → Backend → getCartItems.jsw
// ============================================================
// This runs on the server side so suppressAuth and currentCart work correctly.

import wixData from 'wix-data';
import { currentCart } from 'wix-ecom-backend';

export async function getCartByToken(token) {
  if (!token) return { ok: false, error: 'No token' };

  try {
    const results = await wixData.query('WhatsAppCarts')
      .eq('token', token)
      .find({ suppressAuth: true });

    if (!results.items || results.items.length === 0) {
      return { ok: false, error: 'Cart not found or expired' };
    }

    const record = results.items[0];

    // Delete record after reading (one-time use)
    try {
      await wixData.remove('WhatsAppCarts', record._id, { suppressAuth: true });
    } catch (e) {
      console.warn('[getCartItems] cleanup error:', e);
    }

    let items;
    try {
      items = typeof record.items === 'string' ? JSON.parse(record.items) : record.items;
    } catch (e) {
      return { ok: false, error: 'Invalid items format' };
    }

    return { ok: true, items, phone: record.phone };

  } catch (err) {
    console.error('[getCartByToken] Error:', err);
    return { ok: false, error: err.message };
  }
}

export async function addToCartBackend(items) {
  const WIX_STORES_APP_ID = '215238eb-22a5-4c36-9e7b-41cce8e2a9e8';
  
  const lineItems = items.map(item => ({
    catalogReference: {
      catalogItemId: item.productId,
      appId: WIX_STORES_APP_ID
    },
    quantity: item.quantity || 1
  }));

  try {
    const result = await currentCart.addToCurrentCart({ lineItems });
    return { ok: true, result };
  } catch (err) {
    console.error('[getCartItems] addToCurrentCart error:', err);
    return { ok: false, error: err.message };
  }
}
