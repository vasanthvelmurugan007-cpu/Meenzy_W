/**
 * wixCartService.js
 *
 * Calls the Wix HTTP function `createWhatsAppCart` to create a
 * temporary cart record in the Wix CMS, and returns a cart link
 * that can be sent to the customer via WhatsApp.
 *
 * Usage:
 *   const { cartUrl } = await createWixCartLink({
 *     phone: '919845444003',
 *     items: [{ productId: 'WIX_PRODUCT_ID', quantity: 2 }]
 *   });
 *   // Send cartUrl to customer on WhatsApp
 */

const WIX_FUNCTION_URL =
  process.env.WIX_FUNCTION_URL ||
  'https://www.meenzy.com/_functions/createWhatsAppCart';

/**
 * Creates a Wix cart from a WhatsApp order and returns the payment link.
 *
 * @param {Object} opts
 * @param {string} opts.phone   - Customer's WhatsApp phone number (e.g. "919845444003")
 * @param {Array}  opts.items   - Array of { productId: string, quantity: number }
 * @returns {Promise<{ ok: boolean, cartUrl: string, token: string }>}
 */
async function createWixCartLink({ phone, items }) {
  if (!phone || !items || !items.length) {
    throw new Error('wixCartService: phone and items are required');
  }

  const response = await fetch(WIX_FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, items }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Wix cart creation failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.ok || !data.cartUrl) {
    throw new Error(`Wix cart creation error: ${JSON.stringify(data)}`);
  }

  return { ok: true, cartUrl: data.cartUrl, token: data.token };
}

module.exports = { createWixCartLink };
