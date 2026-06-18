/**
 * wixProductMap.js
 *
 * Maps WhatsApp order product names → Wix Store Product IDs
 *
 * HOW TO USE:
 *   const { getProductId } = require('./wixProductMap');
 *   const productId = getProductId('Seer Fish'); // returns the Wix product ID
 *
 * The keys are flexible — both English and Tamil/local names are supported.
 * The values are Wix Product UUIDs extracted from catalog_products.csv
 */

const PRODUCT_MAP = {
  // ───── SEER FISH / VANJARAM ─────
  'seer fish':              '00ffc66b-7468-483e-b255-e4301277f659',  // Slice Full ring
  'vanjaram':               '00ffc66b-7468-483e-b255-e4301277f659',
  'seer fish slice':        '00ffc66b-7468-483e-b255-e4301277f659',
  'seer fish half ring':    '8c7fb98b-6a09-4e87-9690-f6da3eb94ea8',
  'seer fish cubes':        '773384a2-9cbc-4264-8a9b-1681b02e4f90',
  'seer fish fillet':       '41632747-ded9-45b4-9816-7d142764cb25',

  // ───── WHITE PRAWN ─────
  'white prawn':            'f9b17816-ce21-4000-b508-a7df1710f7ea',
  'shrimp':                 'f9b17816-ce21-4000-b508-a7df1710f7ea',
  'prawn':                  'f9b17816-ce21-4000-b508-a7df1710f7ea',

  // ───── TIGER PRAWN ─────
  'tiger prawn':            'ac3c9036-40bc-4bde-9f9f-6db42065cbee',
  'vari era':               'ac3c9036-40bc-4bde-9f9f-6db42065cbee',

  // ───── RED TIGER PRAWN ─────
  'red tiger prawn':        '75d7f433-fa3d-4ac8-a11d-6cb3ffd6a219',

  // ───── KANAVA / SQUID ─────
  'kanava':                 '59274f88-210a-4a58-b881-22a6296be67e',
  'squid':                  '59274f88-210a-4a58-b881-22a6296be67e',
  'kadamba':                '59274f88-210a-4a58-b881-22a6296be67e',

  // ───── ANCHOVY / NETHILI ─────
  'anchovy':                '5b210213-df44-49eb-afed-2656242bc85a',
  'nethili':                '5b210213-df44-49eb-afed-2656242bc85a',
  'nethali':                '5b210213-df44-49eb-afed-2656242bc85a',

  // ───── MACKEREL / AYALA ─────
  'mackerel':               'ba3af199-e38f-4fdd-b8fd-70a917f13098',
  'ayala':                  'ba3af199-e38f-4fdd-b8fd-70a917f13098',
  'kanangeluthi':           'ba3af199-e38f-4fdd-b8fd-70a917f13098',

  // ───── YELLOW FIN TUNA / KERA ─────
  'tuna':                   'f217e64c-9266-429e-987c-09e08d8e84ed',
  'yellow fin tuna':        'f217e64c-9266-429e-987c-09e08d8e84ed',
  'kera':                   'f217e64c-9266-429e-987c-09e08d8e84ed',
  'soorai':                 '1da05abb-9aba-4c21-8557-93c71d7748a2',

  // ───── SANKARA / PINK PERCH ─────
  'sankara':                '9e17c79e-0d00-46a9-b80f-70a8edfd373a',
  'pink perch':             '9e17c79e-0d00-46a9-b80f-70a8edfd373a',
  'kilimeen':               '9e17c79e-0d00-46a9-b80f-70a8edfd373a',

  // ───── BLACK POMFRET / KARU VAVAL ─────
  'black pomfret':          '23d91360-1a02-4f14-a5b4-d84a02834da6',
  'karu vaval':             '23d91360-1a02-4f14-a5b4-d84a02834da6',
  'pomfret':                '23d91360-1a02-4f14-a5b4-d84a02834da6',

  // ───── INDIAN SALMON / KAALA ─────
  'indian salmon':          'f635550b-e682-4a96-9ba5-b7fae8a001bd',
  'kaala':                  'f635550b-e682-4a96-9ba5-b7fae8a001bd',
  'salmon':                 'f635550b-e682-4a96-9ba5-b7fae8a001bd',
  'rawas':                  'f635550b-e682-4a96-9ba5-b7fae8a001bd',

  // ───── MANJA PAARAI / TREVALLY ─────
  'manja paarai':           '1a662267-63a7-4b6b-8c75-78187c85379e',
  'trevally':               '1a662267-63a7-4b6b-8c75-78187c85379e',
  'yellow tail trevally':   '1a662267-63a7-4b6b-8c75-78187c85379e',

  // ───── SARDINE / MATHI ─────
  'sardine':                '2d906b01-192f-4230-bc45-a887e162706a',
  'mathi':                  '2d906b01-192f-4230-bc45-a887e162706a',
  'chala':                  '2d906b01-192f-4230-bc45-a887e162706a',

  // ───── SHEELA / BARRACUDA ─────
  'sheela':                 '934502d9-4ada-4aad-bca0-2aae071efde8',
  'cheela':                 '934502d9-4ada-4aad-bca0-2aae071efde8',
  'ooli':                   '934502d9-4ada-4aad-bca0-2aae071efde8',
  'barracuda':              '934502d9-4ada-4aad-bca0-2aae071efde8',

  // ───── RED SNAPPER ─────
  'red snapper':            'e9604d43-53be-46b8-ad85-c7fe7acac641',

  // ───── PARLA FISH / MAHI-MAHI ─────
  'parla fish':             '7479929b-23b4-449b-b3b6-ebe8fd550b78',
  'mahi mahi':              'a544bc46-c6d4-40c4-95f2-1006bcd456bf',

  // ───── CRAB ─────
  'crab':                   'c690c5e5-f006-4cc8-9526-2f63a9f4db98',
  'nandu':                  'c690c5e5-f006-4cc8-9526-2f63a9f4db98',

  // ───── COBIA / KADAL VERAAL ─────
  'cobia':                  '3cdf9543-50d9-44f1-a95f-f1d423ed7e9f',
  'kadal veraal':           '3cdf9543-50d9-44f1-a95f-f1d423ed7e9f',

  // ───── BARRAMUNDI ─────
  'barramundi':             '32259007-0004-4c35-9ab2-09be1794b1bd',
  'koduva':                 '32259007-0004-4c35-9ab2-09be1794b1bd',
};

/**
 * Look up the Wix Product ID for a given product name.
 * Case-insensitive and trims whitespace.
 *
 * @param {string} name - Product name as received from WhatsApp
 * @returns {string|null} - Wix product UUID or null if not found
 */
function getProductId(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  return PRODUCT_MAP[key] || null;
}

/**
 * Convert a list of { name, quantity } items from a WhatsApp order
 * into the format needed by wixCartService.createWixCartLink().
 *
 * @param {Array<{name: string, quantity: number}>} orderItems
 * @returns {Array<{productId: string, quantity: number}>}
 */
function mapOrderToWixItems(orderItems) {
  const mapped = [];
  const unmapped = [];

  for (const item of orderItems) {
    const productId = getProductId(item.name);
    if (productId) {
      mapped.push({ productId, quantity: item.quantity || 1 });
    } else {
      unmapped.push(item.name);
    }
  }

  if (unmapped.length > 0) {
    console.warn('[WixProductMap] Unmapped products (not in Wix store):', unmapped);
  }

  return mapped;
}

module.exports = { getProductId, mapOrderToWixItems, PRODUCT_MAP };
