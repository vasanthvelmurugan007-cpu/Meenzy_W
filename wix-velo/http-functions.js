// ============================================================
// FILE: backend/http-functions.js
// WHERE TO PUT IT: Wix Editor → Dev Mode → Backend → http-functions.js
// ============================================================
//
// This file creates a Wix HTTP endpoint that your Meenzy backend
// calls to create a temporary cart record in the WhatsAppCarts CMS.
//
// Endpoint:
//   POST https://www.meenzy.com/_functions/createWhatsAppCart
//
// Body (JSON):
//   {
//     "phone": "919845444003",
//     "items": [
//       { "productId": "YOUR_WIX_PRODUCT_ID", "quantity": 2 }
//     ]
//   }
//
// Response:
//   { "ok": true, "cartUrl": "https://www.meenzy.com/cart-sync?cart_token=TOKEN", "token": "TOKEN" }
// ============================================================

import { ok, badRequest, serverError } from 'wix-http-functions';
import wixData from 'wix-data';

function generateToken() {
  // Simple UUID-like token without external dependency
  return 'xxxx-xxxx-4xxx-yxxx-xxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  }) + '-' + Date.now().toString(36);
}

export async function post_createWhatsAppCart(request) {
  try {
    const body = await request.body.json();
    const { phone, items } = body;

    // --- Validate ---
    if (!phone || !Array.isArray(items) || items.length === 0) {
      return badRequest({
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields: phone, items' })
      });
    }

    const token = generateToken();

    // --- Save to WhatsAppCarts CMS collection ---
    await wixData.insert('WhatsAppCarts', {
      token,
      phone: String(phone),
      items: JSON.stringify(items)   // stored as text; parsed on cart-sync page
    }, { suppressAuth: true });

    const cartUrl = `https://www.meenzy.com/cart-sync?cart_token=${token}`;

    return ok({
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, cartUrl, token })
    });

  } catch (err) {
    console.error('[createWhatsAppCart] Error:', err);
    return serverError({
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Internal server error' })
    });
  }
}
