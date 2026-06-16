const { Router } = require('express');
const pool = require('../db');
const { decrypt } = require('../util/crypto');
const { safeEqual, verifyMetaSignature } = require('../util/webhookSignature');
const { evaluateTriggers, resumeAutomation } = require('../engine/automationEngine');
const { markPending, MEDIA_TYPES } = require('../services/mediaDownloader');
const { enqueueMediaDownload } = require('../queue/mediaQueue');
const catalogProducts = require('../catalogData');
const { handleCartState, handleFreeformText } = require('../engine/cartManager');

// Removed Google Generative AI in favor of direct OpenRouter fetch

// === Cart Abandonment Tracking ===
async function updateTemporaryCart(client, phone, item, quantity, step = 'building_cart') {
  try {
    await client.query(`
      INSERT INTO coexistence.meenzy_temporary_carts (whatsapp_id, cart_json, current_step, updated_at)
      VALUES ($1, jsonb_build_object($2::text, $3::numeric), $4, NOW())
      ON CONFLICT (whatsapp_id) DO UPDATE SET
        cart_json = coexistence.meenzy_temporary_carts.cart_json || jsonb_build_object($2::text, $3::numeric),
        current_step = EXCLUDED.current_step,
        updated_at = NOW()
    `, [phone, item || 'viewing_cart', quantity || 0, step]);
  } catch (err) {
    console.error('[cart-tracking] Error updating cart:', err.message);
  }
}

// === AI Cross Sell ===
async function generateCrossSellLLM(cartItems) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
    if ((!apiKey && !process.env.GROQ_API_KEY) || !cartItems || cartItems.length === 0) return null;
    
    const itemsList = cartItems.map(i => i.ordered_item || i.item).join(', ');
    const systemPrompt = `You are an expert seafood sales AI for Meenzy. 
The customer has the following items in their cart: ${itemsList}.
Suggest exactly ONE highly relevant cross-sell item (like a specific fish fry masala, marinades, or a complementary seafood item) to complete their meal.
Return your response STRICTLY as a JSON object with these keys:
- "title": Name of the suggested item (e.g., "Chettinad Fish Fry Masala")
- "price": A realistic integer price in INR (e.g., 50, 150)
- "message": A short, exciting 1-sentence sales pitch with an emoji.

Output ONLY valid JSON. No markdown wrappers. Example: {"title": "Meenzy Special Fish Fry Masala", "price": 50, "message": "🔥 Complete your meal! Add our signature Meenzy Fish Fry Masala (₹50) to perfectly complement your fresh catch!"}`;

    let text = null;
    if (apiKey && apiKey.startsWith("sk-or-v1-")) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "google/gemma-4-31b-it:free", max_tokens: 150, messages: [{ role: "system", content: systemPrompt }] })
      });
      const data = await response.json();
      text = data?.choices?.[0]?.message?.content?.trim();
    } else if (apiKey) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] })
      });
      const data = await response.json();
      text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    }
    
    if (!text && process.env.GROQ_API_KEY) {
      console.log('[ai-cross-sell] Falling back to Groq');
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "system", content: systemPrompt }],
          max_tokens: 150,
          temperature: 0.5
        })
      });
      const data = await response.json();
      text = data?.choices?.[0]?.message?.content?.trim();
    }
    
    if (text) {
      const parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, ''));
      parsed.id = "ai_upsell_" + Math.floor(Math.random() * 1000);
      return parsed;
    }
    return null;
  } catch(e) {
    console.error('[ai-cross-sell] Error:', e.message);
    return null;
  }
}


// === LLM Triage ===
async function triageWithLLM(messageText, preferences = null) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey && !process.env.GROQ_API_KEY) return 'GENERAL_FAQ';
    
    const prompt = `You are an AI assistant for Meenzy Fresh Seafood. Classify the user's intent into EXACTLY ONE of these categories:
- PLACING_ORDER (User wants to buy something)
- ORDER_COMPLAINT (User is unhappy, missing items, bad quality)
- DELIVERY_QUERY (User is asking when it arrives)
- RECIPE_QUERY (User is asking how to cook, recipes, marinades for seafood)
- HUMAN_HANDOFF (User explicitly asks to speak to a human, agent, or person)
- GENERAL_FAQ (Business hours, location, cleaning process)
Message: "${messageText}"
${preferences ? `User Preferences: ${preferences}\n` : ''}Output ONLY the exact category name.`;

    let textResult = null;
    if (apiKey && apiKey.startsWith("sk-or-v1-")) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "model": "google/gemma-4-31b-it:free",
          "max_tokens": 500,
          "messages": [{ "role": "user", "content": prompt }]
        })
      });
      const data = await response.json();
      textResult = data?.choices?.[0]?.message?.content?.trim();
    } else if (apiKey) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            "contents": [{ "parts": [{"text": prompt}] }]
          })
        });
        const data = await response.json();
        textResult = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      } catch (e) {
        console.error('[llm-triage] Gemini fetch error:', e.message);
      }
    }

    if (!textResult && process.env.GROQ_API_KEY) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: 100,
            messages: [{ role: "user", content: prompt }]
          })
        });
        const data = await response.json();
        textResult = data?.choices?.[0]?.message?.content?.trim();
      } catch (e) {
        console.error('[llm-triage] Groq fallback error:', e.message);
      }
    }

    return textResult || 'GENERAL_FAQ';
  } catch(e) {
    console.error('[llm-triage] Error:', e.message);
    return 'GENERAL_FAQ';
  }
}

// === LLM Natural Language Order Extraction ===
async function extractOrderLLM(messageText, preferences = null) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey && !process.env.GROQ_API_KEY) return [];
    
    // Admins can configure the master prompt via the AiAgentBuilderPage
    const systemPrompt = process.env.LLM_INTAKE_PROMPT || `You are an AI order intake agent for Meenzy Fresh Seafood. 
Extract the seafood items and quantities from the user's message. 
Map the items to standard names (e.g., "vanjaram" -> "Seer Fish", "prawn" -> "White Prawns", "pomfret" -> "Pomfret", "rohu" -> "Rohu", "mathi" -> "Sardine", "sankara" -> "Shankara", "red snapper" -> "Red Snapper").
If a fish name is not in the list, just use the name the user provided with proper capitalization.
You must also generate a friendly order confirmation message that matches the exact language and tone the user used (e.g. Tanglish, Tamil, or English). Do NOT include the checkout link in the reply, just the friendly confirmation.
Return the result strictly as a JSON object with keys "items" (array of {item: string, qty: number}) and "reply" (string).
For example: {"items": [{"item": "Seer Fish", "qty": 2.5}], "reply": "Super! Unga 2.5 kg vanjaram order ready."}
Never return empty items if any fish name is mentioned. Extract it even if it's misspelled.
If no order is found at all, return {"items": [], "reply": ""}.
${preferences ? `Consider the user's saved preferences: ${preferences}\n` : ''}Output ONLY valid JSON. No markdown formatting.`;

    let text = null;
    if (apiKey && apiKey.startsWith("sk-or-v1-")) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "model": "google/gemma-4-31b-it:free",
          "max_tokens": 1000,
          "messages": [
            { "role": "system", "content": systemPrompt },
            { "role": "user", "content": messageText }
          ]
        })
      });
      const data = await response.json();
      text = data?.choices?.[0]?.message?.content?.trim();
    } else if (apiKey) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            "contents": [{ "parts": [{"text": "System Instructions:\n" + systemPrompt + "\n\nUser Message:\n" + messageText}] }]
          })
        });
        const data = await response.json();
        text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      } catch (e) {
        console.error('[llm-intake] Gemini fetch error:', e.message);
      }
    }

    if (!text && process.env.GROQ_API_KEY) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: 1000,
            messages: [
              { role: "system", "content": systemPrompt },
              { role: "user", "content": messageText }
            ]
          })
        });
        const data = await response.json();
        text = data?.choices?.[0]?.message?.content?.trim();
      } catch (e) {
        console.error('[llm-intake] Groq fallback error:', e.message);
      }
    }
    
    text = text || '{"items":[], "reply":""}';
    
    if (text.startsWith('```json')) text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    if (text.startsWith('```')) text = text.replace(/```/g, '').trim();
    
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      // Fallback if LLM returns just the array
      return { items: parsed, reply: "🤖 *AI Order Assistant*\n\nI've extracted the following items from your message:\n\n" };
    }
    return parsed;
  } catch(e) {
    console.error('[llm-intake] Error extracting order:', e.message);
    return { items: [], reply: "" };
  }
}

// === LLM Multilingual FAQ Generation ===
async function generateFAQResponseLLM(messageText) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey && !process.env.GROQ_API_KEY) return null;
    
    const systemPrompt = `You are a friendly customer service AI for Meenzy Fresh Seafood.
Your job is to answer general questions or delivery inquiries based on our business context.
Context: Meenzy delivers fresh, live-catch seafood to the customer's door. We operate primarily online.
CRITICAL INSTRUCTION: You must reply in the EXACT SAME LANGUAGE the customer used in their message. If they used English, use English. If they used Tamil (or Tanglish), use Tamil. If Hindi, use Hindi. Keep the response concise, helpful, and use emojis.

Customer Message: "${messageText}"`;

    let text = null;
    if (apiKey && apiKey.startsWith("sk-or-v1-")) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "model": "google/gemma-4-31b-it:free",
          "max_tokens": 500,
          "messages": [
            { "role": "system", "content": systemPrompt }
          ]
        })
      });
      const data = await response.json();
      text = data?.choices?.[0]?.message?.content?.trim();
    } else if (apiKey) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            "contents": [{ "parts": [{"text": systemPrompt}] }]
          })
        });
        const data = await response.json();
        text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      } catch (e) {
        console.error('[llm-faq] Gemini fetch error:', e.message);
      }
    }

    if (!text && process.env.GROQ_API_KEY) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: 500,
            messages: [{ role: "system", "content": systemPrompt }]
          })
        });
        const data = await response.json();
        text = data?.choices?.[0]?.message?.content?.trim();
      } catch (e) {
        console.error('[llm-faq] Groq fallback error:', e.message);
      }
    }
    return text;
  } catch(e) {
    console.error('[llm-faq] Error:', e.message);
    return null;
  }
}

// Robust TSV Parser to handle multi-line quotes and TSV structure
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

// === DYNAMIC WIX TSV CATALOG FETCHER ===
async function fetchCatalogProducts() {
  try {
    const feedUrl = process.env.WIX_FEED_URL;
    if (!feedUrl) {
      console.error("[meenzy-wix-fetch] WIX_FEED_URL missing in env!");
      return [];
    }
    
    console.log(`[meenzy-wix-fetch] Sourcing products from Wix Facebook TSV feed...`);
    const res = await fetch(feedUrl);
    const text = await res.text();
    const rows = parseTSV(text);
    if (rows.length < 2) {
      console.error("[meenzy-wix-fetch] TSV feed is empty or invalid format.");
      return [];
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
    
    console.log(`[meenzy-wix-fetch] Successfully parsed ${items.length} variants from TSV Feed`);
    
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
      retailer_id: item.id, // Wix TSV Feed item ID is the exact synced retailer ID in Meta!
      image_url: item.image_link || item.image_url || ''
    }));
    
    console.log(`[meenzy-wix-fetch] Resolved ${uniqueProducts.length} unique products from TSV Feed`);
    return uniqueProducts;
  } catch (e) {
    console.error("[meenzy-wix-fetch] Wix TSV Fetch Error:", e);
    return [];
  }
}

const { createClient, OAuthStrategy } = require('@wix/sdk');
const { checkout } = require('@wix/ecom');
const { redirects } = require('@wix/redirects');

async function generateWixCheckoutUrl(items) {
  try {
    const clientId = process.env.WIX_CLIENT_ID || '635247a5-3db1-4e5a-8e25-d16605063b14';

    const wixClient = createClient({
      modules: { checkout, redirects },
      auth: OAuthStrategy({ clientId })
    });

    const catalogProducts = await fetchCatalogProducts();
    const lineItems = [];
    
    for (const item of items) {
      let bestMatch = catalogProducts.find(p => p.name.toLowerCase().includes(item.item.toLowerCase()));
      if (!bestMatch) {
         const baseName = getBaseFishName(item.item).toLowerCase();
         bestMatch = catalogProducts.find(p => p.name.toLowerCase().includes(baseName));
      }
      
      if (bestMatch && bestMatch.productId) {
        lineItems.push({
          catalogReference: {
            catalogItemId: bestMatch.productId,
            appId: '215238eb-22a5-4c36-9e7b-e7c08025e04e' // Wix Stores App ID
          },
          quantity: parseFloat(item.qty) || 1
        });
      }
    }

    if (lineItems.length === 0) return null;

    // 1. Create Checkout via SDK
    const chk = await wixClient.checkout.createCheckout({
      channelType: 'WEB',
      lineItems
    });
    
    const checkoutId = chk.checkoutId || chk.id || (chk.checkout ? chk.checkout.id : null);
    if (!checkoutId) return null;

    // 2. Create Redirect Session via SDK
    const redirectSession = await wixClient.redirects.createRedirectSession({
      ecomCheckout: { checkoutId },
      callbacks: {
        postFlowUrl: 'https://meenzy.com/thank-you'
      }
    });
    
    return redirectSession.redirectSession?.fullUrl || null;
    
  } catch (err) {
    console.error('[meenzy-wix] Error generating checkout URL:', err.message);
    return null;
  }
}


function getBaseFishName(name) {
  let clean = name.split(/[\/\-\(]/)[0].trim();
  clean = clean.replace(/[\u0B80-\u0BFF]/g, '').trim();
  return clean || "Seafood Item";
}

async function getDynamicMpmPayload(btnId, catalogId, token) {
  const products = await fetchCatalogProducts();
  console.log(`[meenzy-dynamic-catalog] Fetched ${products.length} products from Wix Catalog`);
  
  let filtered = [];
  let title = "Products";
  let text = "Browse our selections:";
  
  let page = 1;
  let baseCategory = btnId;
  const pageMatch = btnId.match(/(.*)_page_(\d+)$/);
  if (pageMatch) {
    baseCategory = pageMatch[1];
    page = parseInt(pageMatch[2], 10);
  }

  const isBaseFishMode = baseCategory.startsWith('basefish_');
  let targetBaseFish = "";
  if (isBaseFishMode) {
    let encoded = baseCategory.substring("basefish_".length);
    targetBaseFish = Buffer.from(encoded, 'base64').toString('utf-8');
    title = targetBaseFish.substring(0, 24);
    text = `Select your preferred cut for ${title}:`;
    filtered = products.filter(p => p.name.toLowerCase().includes(targetBaseFish.toLowerCase()));
  } else {
    if (baseCategory === 'category_high_protein') {
      title = "High Protein Fish";
      text = "Rich, energy-packed fish (17g - 25g protein):";
      filtered = products.filter(p => p.name.toLowerCase().match(/tuna|salmon|mackerel|halibut|snapper|seer|koduva|kanava/i));
    } else if (baseCategory === 'category_boneless') {
      title = "Boneless Cuts";
      text = "Premium cuts prepared completely boneless:";
      filtered = products.filter(p => p.name.toLowerCase().match(/boneless|fillet|cubes|steak/i));
    } else if (baseCategory === 'category_shellfish') {
      title = "Shellfish & Crabs";
      text = "Tiger prawns, crabs, squid, and lobsters:";
      filtered = products.filter(p => p.name.toLowerCase().match(/prawn|crab|squid|lobster|shrimp|kanava|kooni/i));
    } else if (baseCategory === 'category_instant_buy') {
      title = "Ready to Cook";
      text = "Steaks, Curry Cuts, and Cleaned:";
      filtered = products.filter(p => p.name.toLowerCase().match(/cleaned|curry cut|peeled|slices|steak/i));
    } else {
      title = "All Varieties";
      text = "Top fresh catches today:";
      filtered = products;
    }
  }
  
  let totalItems = filtered.length > 0 ? filtered : products;

  if (isBaseFishMode) {
    return {
      type: "product_list",
      header: { type: "text", text: "🐟 " + title.substring(0, 20) },
      body: { text: "Select your preferred cut natively below to add to cart:" },
      footer: { text: "Meenzy Fresh Seafood 🌊" },
      action: {
        catalog_id: process.env.MEENZY_CATALOG_ID,
        sections: [
          {
            title: "Available Variants",
            product_items: totalItems.slice(0, 30).map(p => ({
              product_retailer_id: String(p.retailer_id || p.id)
            }))
          }
        ]
      }
    };
  }

  // Group into Base Fishes
  const baseFishMap = new Map();
  totalItems.forEach(p => {
    let bName = p.name.split('-')[0].split('/')[0].trim();
    if (!bName || bName.length > 20) bName = p.name.substring(0, 20);
    if (!baseFishMap.has(bName)) {
      baseFishMap.set(bName, 1);
    } else {
      baseFishMap.set(bName, baseFishMap.get(bName) + 1);
    }
  });
  
  const groupedItems = Array.from(baseFishMap.entries()).map(([name, count]) => ({
    name: name,
    count: count
  }));

  const itemsPerPage = 8; // Leave 2 slots for "Next" and "Previous"
  const totalPages = Math.ceil(groupedItems.length / itemsPerPage);
  
  // page is 1-indexed
  const startIndex = (page - 1) * itemsPerPage;
  const pageItems = groupedItems.slice(startIndex, startIndex + itemsPerPage);

  const titleSet = new Set();
  const allRows = pageItems.map(p => {
    let cleanName = p.name.substring(0, 24);
    let id = `basefish_${Buffer.from(p.name).toString('base64')}`;
    let desc = `View ${p.count} options (cuts/variants)`;
    
    let finalTitle = cleanName;
    let counter = 1;
    while (titleSet.has(finalTitle.toLowerCase())) {
      counter++;
      const suffix = ` ${counter}`;
      finalTitle = cleanName.substring(0, 24 - suffix.length) + suffix;
    }
    titleSet.add(finalTitle.toLowerCase());

    return {
      id: id,
      title: finalTitle,
      description: desc
    };
  });

  if (page < totalPages) {
    allRows.push({
      id: `${baseCategory}_page_${page + 1}`,
      title: "Next Page ➡️",
      description: `View page ${page + 1} of ${totalPages}`
    });
  }

  if (page > 1) {
    allRows.push({
      id: `${baseCategory}_page_${page - 1}`,
      title: "⬅️ Previous Page",
      description: `Back to page ${page - 1}`
    });
  }

  // Ensure we do not exceed 10 items (9 items + next/prev = 10 or 11... wait, if page > 1 and page < totalPages, it adds 2 items. So itemsPerPage must be 8 in the middle!)
  // Let's just slice to exactly 10 rows just in case to avoid any crash
  const safeRows = allRows.slice(0, 10);

  return {
    type: "list",
    header: { type: "text", text: "⚡ " + title.substring(0, 20) },
    body: { text: `${text} (Page ${page}/${totalPages})` },
    footer: { text: "Meenzy Fresh Seafood" },
    action: {
      button: "Select Product",
      sections: [{ title: "Products", rows: safeRows.length > 0 ? safeRows : [{ id: "empty", title: "No items", description: "Currently out of stock" }] }]
    }
  };
}

const router = Router();

/**
 * Parse a Meta WhatsApp Cloud API webhook payload and extract message records.
 * Handles: text, image, video, audio, document, location, sticker, contacts,
 *          interactive (button_reply / list_reply), reaction, and status updates.
 */
// Normalize WhatsApp phone numbers to digits-only — strips '+', spaces, dashes.
// Meta sometimes includes leading '+' in display_phone_number, sometimes not;
// without this, the same conversation lands under two different wa_numbers and
// shows as duplicate chat threads.
function normalizePhone(s) {
  if (!s) return s;
  return String(s).replace(/\D/g, '');
}

function parseMetaPayload(body) {
  const records = [];

  if (!body || body.object !== 'whatsapp_business_account') {
    return records;
  }

  const entries = body.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value || {};
      if (value.messaging_product !== 'whatsapp') continue;

      const metadata = value.metadata || {};
      const phoneNumberId = metadata.phone_number_id || '';
      const displayPhoneNumber = metadata.display_phone_number || '';

      // Contact profile info (name mapping)
      const contactProfiles = {};
      (value.contacts || []).forEach(c => {
        const waId = c.wa_id || '';
        const name = c.profile?.name || '';
        if (waId && name) contactProfiles[waId] = name;
      });

      // Parse a single message (shared logic for incoming and outgoing)
      function parseMessage(msg, direction, waNum, contactNum) {
        const record = {
          message_id: msg.id || '',
          phone_number_id: phoneNumberId,
          wa_number: normalizePhone(waNum || displayPhoneNumber),
          contact_number: normalizePhone(contactNum || ''),
          to_number: normalizePhone(msg.to || ''),
          direction,
          message_type: msg.type || 'unknown',
          message_body: null,
          raw_payload: JSON.stringify(body),
          media_url: null,
          media_mime_type: null,
          status: direction === 'incoming' ? 'received' : 'sent',
          timestamp: msg.timestamp
            ? new Date(parseInt(msg.timestamp, 10) * 1000).toISOString()
            : new Date().toISOString(),
          contact_name: contactProfiles[contactNum] || null,
          // Quote-reply: when the customer replies to a specific message, Meta
          // sends the quoted message's wamid here. Stored so we can render the
          // quoted bubble above their reply.
          context_message_id: msg.context?.id || null,
        };

        const type = msg.type;
        if (type === 'text' && msg.text) {
          record.message_body = msg.text.body || '';
        } else if (type === 'image' && msg.image) {
          record.message_body = msg.image.caption || '';
          record.media_mime_type = msg.image.mime_type || null;
          record.media_url = msg.image.id || null;
        } else if (type === 'video' && msg.video) {
          record.message_body = msg.video.caption || '';
          record.media_mime_type = msg.video.mime_type || null;
          record.media_url = msg.video.id || null;
        } else if (type === 'audio' && msg.audio) {
          record.message_body = 'Audio message';
          record.media_mime_type = msg.audio.mime_type || null;
          record.media_url = msg.audio.id || null;
        } else if (type === 'voice' && msg.voice) {
          record.message_body = 'Voice message';
          record.media_mime_type = msg.voice.mime_type || null;
          record.media_url = msg.voice.id || null;
        } else if (type === 'document' && msg.document) {
          record.message_body = msg.document.filename || '';
          record.media_mime_type = msg.document.mime_type || null;
          record.media_url = msg.document.id || null;
          record.media_filename = msg.document.filename || null;
        } else if (type === 'location' && msg.location) {
          const lat = msg.location.latitude || '';
          const lng = msg.location.longitude || '';
          record.message_body = `Location: ${lat}, ${lng}`;
          record.latitude = lat;
          record.longitude = lng;
        } else if (type === 'sticker' && msg.sticker) {
          record.message_body = 'Sticker';
          record.media_mime_type = msg.sticker.mime_type || null;
          record.media_url = msg.sticker.id || null;
        } else if (type === 'contacts' && msg.contacts) {
          const names = msg.contacts.map(c => c.name?.formatted_name || c.name?.first_name || 'Contact').join(', ');
          record.message_body = `Shared contact(s): ${names}`;
        } else if (type === 'interactive' && msg.interactive) {
          const reply = msg.interactive.button_reply || msg.interactive.list_reply || {};
          record.message_body = reply.title || 'Interactive response';
          record.message_type = 'interactive';
          record.selected_button_id = reply.id || null;
        } else if (type === 'reaction' && msg.reaction) {
          record.message_body = `Reaction: ${msg.reaction.emoji || ''}`;
          record.message_type = 'reaction';
          // Capture the target message + emoji so the insert loop can attach it
          // to that message instead of creating a standalone bubble. Empty emoji
          // = the customer removed their reaction.
          record.reaction = {
            targetMessageId: msg.reaction.message_id || null,
            emoji: msg.reaction.emoji || '',
            from: msg.from || null,
          };
        } else if (type === 'order' && msg.order) {
          record.message_body = 'Order received';
        } else if (type === 'system' && msg.system) {
          record.message_body = msg.system.body || 'System message';
        } else if (type === 'unknown' && msg.errors) {
          record.message_body = `Error: ${msg.errors[0]?.message || 'Unknown error'}`;
          record.status = 'error';
        }

        return record;
      }

      // Incoming messages
      const messages = value.messages || [];
      for (const msg of messages) {
        records.push(parseMessage(msg, 'incoming', displayPhoneNumber, msg.from));
      }

      // Outgoing message echoes (messages sent from the WhatsApp Business app)
      const messageEchoes = value.message_echoes || [];
      for (const msg of messageEchoes) {
        // For echoes: from = business number, to = customer
        records.push(parseMessage(msg, 'outgoing', displayPhoneNumber, msg.to));
      }

      // Status updates (delivered, read, sent)
      const statuses = value.statuses || [];
      for (const status of statuses) {
        records.push({
          message_id: status.id || '',
          phone_number_id: phoneNumberId,
          wa_number: normalizePhone(displayPhoneNumber),
          contact_number: normalizePhone(status.recipient_id || ''),
          to_number: normalizePhone(status.recipient_id || ''),
          direction: 'outgoing',
          message_type: 'status',
          message_body: `Status: ${status.status || ''}`,
          raw_payload: JSON.stringify(body),
          media_url: null,
          media_mime_type: null,
          status: status.status || 'unknown',
          timestamp: status.timestamp
            ? new Date(parseInt(status.timestamp, 10) * 1000).toISOString()
            : new Date().toISOString(),
          contact_name: contactProfiles[status.recipient_id] || null,
          // Include full status payload for trigger evaluation
          conversation: status.conversation || null,
          pricing: status.pricing || null,
          errors: status.errors || null,
        });
      }
    }
  }

  return records;
}

/**
 * POST /api/webhook/whatsapp
 * Receives raw Meta WhatsApp webhook payloads forwarded by n8n.
 * No auth required — called by internal n8n instance.
 */
router.post('/webhook/whatsapp', async (req, res) => {
  try {
    // Authenticity: this endpoint is necessarily unauthenticated (public), so
    // the control is Meta's HMAC signature. When META_APP_SECRET is configured
    // we REJECT anything unsigned/invalid; if it's not set we log a warning so
    // operators know inbound webhooks are unverified (forgeable).
    const sig = verifyMetaSignature(req);
    if (sig === false) {
      return res.status(403).json({ error: 'Invalid webhook signature' });
    }
    if (sig === null) {
      console.warn('[webhook] META_APP_SECRET not set — inbound webhook signature NOT verified (set it to reject forged payloads).');
    }

    const payload = req.body;
    if (!payload) {
      return res.status(400).json({ error: 'Empty payload' });
    }

    // Support both array of payloads (n8n batch) and single payload
    const payloads = Array.isArray(payload) ? payload : [payload];
    const allRecords = [];
    for (const p of payloads) {
      const records = parseMetaPayload(p);
      allRecords.push(...records);
    }

    if (allRecords.length === 0) {
      // Acknowledge non-message webhooks (e.g. verification, errors)
      return res.status(200).json({ ok: true, stored: 0 });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const r of allRecords) {
        // Status receipts (sent/delivered/read/failed) update the ORIGINAL
        // message's status — they must never create a chat row. Inserting them
        // produced phantom "Status: delivered" bubbles. If no matching message
        // exists (e.g. an app-sent message we don't track), this is a no-op.
        if (r.message_type === 'status') {
          await client.query(
            `UPDATE coexistence.chat_history SET status = $1 WHERE message_id = $2`,
            [r.status, r.message_id]
          );
          continue;
        }

        // Reactions are NOT chat bubbles — attach the emoji to the message it
        // reacts to (message_reactions). An empty emoji removes the reaction.
        if (r.message_type === 'reaction') {
          const tgt = r.reaction?.targetMessageId;
          if (tgt) {
            if (r.reaction.emoji) {
              await client.query(
                `INSERT INTO coexistence.message_reactions
                   (wa_number, contact_number, target_message_id, direction, emoji, reactor, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,NOW())
                 ON CONFLICT (target_message_id, direction)
                 DO UPDATE SET emoji = EXCLUDED.emoji, reactor = EXCLUDED.reactor, updated_at = NOW()`,
                [r.wa_number, r.contact_number, tgt, r.direction, r.reaction.emoji, r.reaction.from || null]
              );
            } else {
              await client.query(
                `DELETE FROM coexistence.message_reactions WHERE target_message_id = $1 AND direction = $2`,
                [tgt, r.direction]
              );
            }
          }
          continue;
        }

        // Upsert chat_history (ignore duplicates on message_id)
        await client.query(
          `INSERT INTO coexistence.chat_history
            (message_id, phone_number_id, wa_number, contact_number, to_number,
             direction, message_type, message_body, raw_payload, media_url,
             media_mime_type, media_filename, status, timestamp, context_message_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (message_id) DO UPDATE SET
             status = EXCLUDED.status,
             raw_payload = EXCLUDED.raw_payload`,
          [
            r.message_id, r.phone_number_id, r.wa_number, r.contact_number, r.to_number,
            r.direction, r.message_type, r.message_body, r.raw_payload, r.media_url,
            r.media_mime_type, r.media_filename || null, r.status, r.timestamp,
            r.context_message_id || null,
          ]
        );

        // Upsert the WhatsApp profile/push name into profile_name (NOT name).
        // `name` is reserved for a name we explicitly captured (AI ask-name flow
        // or manual save) so inbound messages don't clobber it — that clobbering
        // is what made the automation "is the contact known?" condition always
        // true. Display falls back to COALESCE(name, profile_name).
        if (r.contact_number && r.wa_number && r.contact_name) {
          await client.query(
            `INSERT INTO coexistence.contacts (platform, wa_number, contact_number, profile_name)
             VALUES ('whatsapp', $1, $2, $3)
             ON CONFLICT (platform, wa_number, contact_number) DO UPDATE SET
               profile_name = EXCLUDED.profile_name,
               updated_at = NOW()`,
            [r.wa_number, r.contact_number, r.contact_name]
          );
        }

        // MEENZY Delivery Agent: Live Location Tracking
        if (r.direction === 'incoming' && r.message_type === 'location' && r.latitude && r.longitude) {
          const updateAgentRes = await client.query(
            `UPDATE coexistence.delivery_agents
             SET driver_lat = $1, driver_lng = $2
             WHERE phone = $3
             RETURNING id, name`,
            [r.latitude, r.longitude, r.contact_number]
          );
          
          if (updateAgentRes.rows.length > 0) {
            console.log(`[delivery-agent] Updated live location for ${updateAgentRes.rows[0].name} (${r.contact_number}): ${r.latitude}, ${r.longitude}`);
            r.__handled = true;
          }
        }

        // MEENZY Delivery Agent: Proof of Delivery (POD)
        if (r.direction === 'incoming' && r.message_type === 'image' && !r.__handled) {
          const agentRes = await client.query(`SELECT id, name FROM coexistence.delivery_agents WHERE phone = $1`, [r.contact_number]);
          if (agentRes.rows.length > 0) {
            const agentId = agentRes.rows[0].id;
            // Find oldest OUT_FOR_DELIVERY order for this agent
            const orderRes = await client.query(`
              SELECT id, customer_phone, ordered_item, quantity 
              FROM coexistence.meenzy_preorders 
              WHERE driver_id = $1 AND order_status = 'OUT_FOR_DELIVERY'
              ORDER BY created_at ASC LIMIT 1`, [agentId]);
              
            if (orderRes.rows.length > 0) {
              const order = orderRes.rows[0];
              const podUrl = `/api/media/${r.message_id}`; // Will be available once downloader finishes
              
              await client.query(`
                UPDATE coexistence.meenzy_preorders 
                SET order_status = 'DELIVERED', delivered_at = NOW(), pod_image_url = $1 
                WHERE id = $2`, [podUrl, order.id]);
                
              console.log(`[delivery-agent] Marked order ${order.id} as DELIVERED by ${agentRes.rows[0].name}`);
              
              // Notify Customer
              const { resolveAccount, insertPendingRow } = require('../services/messageSender');
              const { enqueueSend } = require('../queue/sendQueue');
              const { account, error } = await resolveAccount({});
              if (!error && account) {
                const confText = `✅ *Your order has been delivered!* 📦\n\nYour package of ${order.quantity}kg ${order.ordered_item} has been successfully delivered by ${agentRes.rows[0].name}. Please find the delivery photo attached.\n\nThank you for choosing Meenzy Fresh Seafood! 🍽️`;
                const localId = await insertPendingRow({
                  account, toNumber: order.customer_phone, messageType: 'image', messageBody: confText, mediaUrl: r.media_url
                });
                await enqueueSend({
                  kind: 'media', accountId: account.id, to: String(order.customer_phone).replace(/\D/g, ''), localMessageId: localId, payload: { type: 'image', link: r.media_url, caption: confText }
                });
              }
              r.__handled = true;
            }
          }
        }

        // MEENZY Custom Workflow Rule 2: Inbound Regex Parser Engine for preorders (Simple Format: Fish Name, Qty)
        if (r.direction === 'incoming' && r.message_body) {
          const trimmedBody = r.message_body.trim();
          const match = trimmedBody.match(/^([a-zA-Z\s\/]+)[,\s]+(\d+(?:\.\d+)?)\s*(?:kg|kgs)?$/i);
          if (match) {
            const item = match[1].trim().toLowerCase();
            const qty = parseFloat(match[2]);
            
            let resolvedItem = null;
            if (item.includes('seer') || item.includes('vanjaram')) {
              resolvedItem = 'Seer Fish / Vanjaram';
            } else if (item.includes('pomfret')) {
              resolvedItem = 'Pomfret';
            } else if (item.includes('prawn') || item.includes('iral')) {
              resolvedItem = 'White Prawns / Iral';
            } else if (item.includes('rohu')) {
              resolvedItem = 'Rohu';
            }

            if (resolvedItem) {
              await client.query(
                `INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status)
                 VALUES ($1, $2, $3, 'PENDING_CHECKOUT')`,
                [r.contact_number, resolvedItem, qty]
              );
              console.log(`[meenzy-preorder] Successfully created preorder: customer=${r.contact_number}, item=${resolvedItem}, quantity=${qty}`);
              
              // Send WhatsApp Order Confirmation Message with Cart Link
              const { resolveAccount, insertPendingRow } = require('../services/messageSender');
              const { enqueueSend } = require('../queue/sendQueue');
              const { account, error } = await resolveAccount({});
              if (!error && account) {
                const cartPayload = [{ item: resolvedItem, qty }];
                const base64Cart = Buffer.from(JSON.stringify(cartPayload)).toString('base64');
                const encodedCart = encodeURIComponent(base64Cart);
                const checkoutUrl = `https://www.meenzy.in/cart-page?data=${encodedCart}&phone=${r.contact_number}`;
                
                const confText = `🐟 *Meenzy Preorder Initiated!* 🌊\n\nYour preorder for *${resolvedItem} (${qty} kg)* is almost ready!\n\nPlease click the link below to review your exact order details, see the price, and securely checkout on our website:\n${checkoutUrl}\n\nThank you! 🍽️`;
                const localId = await insertPendingRow({
                  account,
                  toNumber: r.contact_number,
                  messageType: 'text',
                  messageBody: confText,
                });
                await enqueueSend({
                  kind: 'text',
                  accountId: account.id,
                  to: String(r.contact_number).replace(/\D/g, ''),
                  localMessageId: localId,
                  payload: { body: confText, previewUrl: true },
                });
                console.log(`[meenzy-preorder] Sent registration confirmation to: ${r.contact_number}`);
              }
              r.__handled = true;
            }
          }
        }

        // MEENZY Custom Workflow Rule 2.5: Inbound WhatsApp Native Order Parser
        if (r.direction === 'incoming' && r.message_type === 'order' && r.raw_payload) {
          try {
            const rawObj = JSON.parse(r.raw_payload);
            const metaMsg = rawObj?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
            if (metaMsg && metaMsg.type === 'order' && metaMsg.order) {
              const orderData = metaMsg.order;
              const items = orderData.product_items || [];
              const catalogId = orderData.catalog_id;
              
              if (items.length > 0) {
                const { processCheckout } = require('./meenzy');
                await processCheckout(r.contact_number, items, catalogId);
                r.__handled = true;
              }
            }
          } catch (e) {
            console.error('[meenzy-native-order-parser] Error:', e.message);
          }
        }

        // MEENZY Custom Workflow Rule 4: Welcome & Menu Trigger on "Hi"
        if (r.direction === 'incoming' && r.message_body && !r.__handled) {
          const trimmedBody = r.message_body.trim().toLowerCase();
          
          if (trimmedBody === 'hi iam agent') {
            // Check if sender is a Delivery Agent
            const agentRes = await client.query('SELECT id, name, phone, plain_pin FROM coexistence.delivery_agents WHERE RIGHT(REGEXP_REPLACE(phone, \'\\D\', \'\', \'g\'), 10) = RIGHT(REGEXP_REPLACE($1, \'\\D\', \'\', \'g\'), 10)', [r.contact_number]);
            if (agentRes.rows.length > 0) {
              const agentId = agentRes.rows[0].id;
              const agentName = agentRes.rows[0].name;
              let displayPin = agentRes.rows[0].plain_pin;

              // Auto-heal missing plaintext PIN for legacy agents
              if (!displayPin) {
                const bcrypt = require('bcryptjs');
                displayPin = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit pin
                const hash = await bcrypt.hash(displayPin, 10);
                await client.query('UPDATE coexistence.delivery_agents SET plain_pin = $1, pin_hash = $2 WHERE id = $3', [displayPin, hash, agentId]);
              }

              console.log(`[delivery-agent] Intercepted agent login from agent: ${agentName} (${r.contact_number})`);
              
              const { resolveAccount, insertPendingRow } = require('../services/messageSender');
              const { enqueueSend } = require('../queue/sendQueue');
              const { account, error } = await resolveAccount({});
              if (!error && account) {
                const portalUrl = `${process.env.CORS_ORIGIN || 'https://meenzy-frontend.onrender.com'}/#/agent-portal`;
                const agentMsg = `Welcome back, ${agentName} 🚚!\n\nHere is your portal link to view and manage your assigned deliveries:\n🔗 ${portalUrl}\n\n*Your Login Details:*\n📱 Phone: ${agentRes.rows[0].phone}\n🔒 PIN: ${displayPin}\n\nDrive safe!`;
                const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'text', messageBody: agentMsg });
                await enqueueSend({ kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { body: agentMsg, previewUrl: false } });
              }
              r.__handled = true;
            }
          }

          if ((trimmedBody === 'hi' || trimmedBody === 'hello') && !r.__handled) {
            console.log(`[meenzy-welcome] Inbound "hi" from customer: ${r.contact_number}`);
            
            const { resolveAccount, insertPendingRow } = require('../services/messageSender');
            const { enqueueSend } = require('../queue/sendQueue');
            
            const { account, error } = await resolveAccount({});
            if (!error && account) {
              const welcomeText = "✨ *Welcome to Meenzy Fresh Catch!* 🌊🦞\n\nBrowse our full catalog and place your order directly on our website:\n🐟 https://www.meenzy.in/category/all-products\n\n💬 *Easy WhatsApp Ordering:*\n• *Text us:* Simply send the fish name and quantity (e.g., \"Seer fish 2kg\").\n• *Voice Orders:* Just send us a voice note with what you'd like!\n\n👨‍🍳 *Need Cooking Tips?*\nAsk us _\"how to cook my order\"_ or for recipe ideas, and our AI chef will help you out!";

              const localId = await insertPendingRow({
                account,
                toNumber: r.contact_number,
                messageType: 'text',
                messageBody: '✨ Welcome to Meenzy Fresh Catch! Sent website links.',
              });
              await enqueueSend({
                kind: 'text',
                accountId: account.id,
                to: String(r.contact_number).replace(/\D/g, ''),
                localMessageId: localId,
                payload: { body: welcomeText, previewUrl: true },
              });
              
              console.log(`[meenzy-welcome] Successfully enqueued welcome text response with links for: ${r.contact_number}`);
            }
            r.__handled = true;
          }
        }


        // MEENZY Custom Workflow Rule 3: State Machine Cart Router
        if (r.direction === 'incoming' && r.message_type === 'interactive' && r.selected_button_id) {
          const btnId = r.selected_button_id;
          console.log(`[meenzy-interactive] Selected Button ID: ${btnId} from customer: ${r.contact_number}`);
          
          const { resolveAccount, insertPendingRow } = require('../services/messageSender');
          const { enqueueSend } = require('../queue/sendQueue');
          const { account, error } = await resolveAccount({});
          console.log('[DEBUG-2] resolveAccount returned:', { hasAccount: !!account, error });
          
          if (!error && account) {
            // New: Cancellation & Resolution Flow
            if (btnId.startsWith('cancel_wix_order_') || btnId.startsWith('resolution_') || btnId.startsWith('reason_refund_') || btnId.startsWith('postpone_date_')) {
              const { handleOrderResolutionFlow } = require('../engine/resolutionManager');
              await handleOrderResolutionFlow(client, r.contact_number, account, btnId, insertPendingRow, enqueueSend);
              r.__handled = true;
              continue;
            }

            if (btnId.startsWith('flash_buy_')) {
              const fsId = parseInt(btnId.replace('flash_buy_', ''), 10);
              
              // 1. Check stock and decrement using row-level locking
              const stockRes = await client.query(`
                UPDATE coexistence.meenzy_flash_sales
                SET remaining_quantity = remaining_quantity - 1
                WHERE id = $1 AND remaining_quantity >= 1 AND is_active = TRUE
                RETURNING product_name, price
              `, [fsId]);
              
              let msgText = "";
              if (stockRes.rows.length > 0) {
                const fs = stockRes.rows[0];
                // 2. Create the preorder
                await client.query(`
                  INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status)
                  VALUES ($1, $2, 1, 'pending_market')
                `, [r.contact_number, fs.product_name]);
                
                msgText = `🎉 *Got it!* You successfully secured 1Kg of ${fs.product_name} at the flash price of ₹${fs.price}!\n\nWe will send your tracking link shortly.`;
              } else {
                msgText = `😔 *Sold Out!* Sorry, the flash sale for this item has completely sold out or ended. Better luck next time!`;
              }
              
              const localId = await insertPendingRow({
                account, toNumber: r.contact_number, messageType: 'text', messageBody: msgText
              });
              await enqueueSend({
                kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { body: msgText, previewUrl: false }
              });
              
              r.__handled = true;
              continue;
            }

            const handled = await handleCartState(r.contact_number, account, btnId);
            if (handled) continue;
          }
        }

        // MEENZY Custom Workflow Rule 4.4: Human Handoff / Bot Pause
        if (r.direction === 'incoming' && r.message_body && !r.__handled) {
          const bodyLower = r.message_body.trim().toLowerCase();
          if (bodyLower === 'resume bot') {
             await client.query(`UPDATE coexistence.contacts SET bot_paused_until = NULL WHERE contact_number = $1`, [r.contact_number]);
             const { resolveAccount, insertPendingRow } = require('../services/messageSender');
             const { enqueueSend } = require('../queue/sendQueue');
             const { account } = await resolveAccount({});
             if (account) {
                const text = "🤖 I am back online! How can I help you with your seafood order today?";
                const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'text', messageBody: text });
                await enqueueSend({ kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
             }
             r.__handled = true;
          } else {
             try {
               const { rows: pauseRows } = await client.query(`SELECT bot_paused_until FROM coexistence.contacts WHERE contact_number = $1`, [r.contact_number]);
               if (pauseRows.length > 0 && pauseRows[0].bot_paused_until && new Date(pauseRows[0].bot_paused_until) > new Date()) {
                  r.__handled = true; // Skip all AI and automated processing
                  console.log(`[bot-paused] Ignoring message from ${r.contact_number} as bot is paused for handoff.`);
               }
             } catch(e) {}
          }
        }

        // MEENZY Custom Workflow Rule 4.5: Bulk Quotes
        if (r.direction === 'incoming' && r.message_body && !r.__handled) {
          const trimmedBody = r.message_body.trim().toLowerCase();
          const { bulkSessions, startBulkFlow, handleBulkText } = require('../engine/bulkManager');
          
          if (trimmedBody === 'bulk') {
            console.log(`[bulk-quotes] Inbound "bulk" from customer: ${r.contact_number}`);
            const { resolveAccount, insertPendingRow } = require('../services/messageSender');
            const { enqueueSend } = require('../queue/sendQueue');
            const { account } = await resolveAccount({});
            if (account) {
              await startBulkFlow(r.contact_number, account, insertPendingRow, enqueueSend);
            }
            r.__handled = true;
          } else if (bulkSessions[r.contact_number]) {
            const { resolveAccount, insertPendingRow } = require('../services/messageSender');
            const { enqueueSend } = require('../queue/sendQueue');
            const { account } = await resolveAccount({});
            if (account) {
              await handleBulkText(r.contact_number, r.message_body, account, insertPendingRow, enqueueSend);
            }
            r.__handled = true;
          }
        }

        // MEENZY Coins and Loyalty
        if (r.direction === 'incoming' && r.message_body && !r.__handled) {
          const bodyLower = r.message_body.trim().toLowerCase();
          if (bodyLower === 'my coins' || bodyLower === 'coins' || bodyLower === 'referral' || bodyLower === 'balance') {
            const { rows: userRows } = await client.query(`SELECT meenzy_coins, referral_code FROM coexistence.contacts WHERE contact_number = $1`, [r.contact_number]);
            if (userRows.length > 0) {
              const u = userRows[0];
              const coins = u.meenzy_coins || 0;
              const ref = u.referral_code || 'N/A';
              const text = `💰 *Meenzy Coins Balance* 💰\n\nYou currently have *${coins} Coins*! (1 Coin = ₹1)\n\n🎁 *Refer & Earn:*\nShare your unique referral code *${ref}* with friends! When they order using your code, you both get 50 bonus coins!`;
              const { resolveAccount, insertPendingRow } = require('../services/messageSender');
              const { enqueueSend } = require('../queue/sendQueue');
              const { account, error } = await resolveAccount({});
              if (!error && account) {
                const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'text', messageBody: 'Sent Meenzy Coins balance' });
                await enqueueSend({ kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
              }
            }
            r.__handled = true;
          }
        }

        // MEENZY Custom Workflow Rule 4.9: Suppress Synchronous AI for Voice
        if (r.direction === 'incoming' && (r.message_type === 'audio' || r.message_type === 'voice') && !r.__handled) {
          console.log(`[voice-order] Supressing synchronous AI for raw audio message from ${r.contact_number}. Waiting for Whisper transcription...`);
          r.__handled = true;
        }

        // MEENZY Custom Workflow Rule 5: LLM Triage and Swap parser
        if (r.direction === 'incoming' && r.message_body && !r.__handled) {
          const trimmedBody = r.message_body.trim();
          
          // Temporary Pincode Capture
          if (/^\d{6}$/.test(trimmedBody)) {
             const pincode = trimmedBody;
             let updatedCount = 0;
             
             // Update ecosystem_orders
             try {
               const res1 = await client.query(`
                 UPDATE coexistence.ecosystem_orders 
                 SET address_line = COALESCE(address_line, '') || ' Pincode: ' || $1 
                 WHERE user_phone = $2 AND status::text IN ('CREATED', 'CONFIRMED', 'PENDING_VERIFICATION')
               `, [pincode, r.contact_number]);
               updatedCount += res1.rowCount;
             } catch (e) {
               console.error('[pincode-capture] Error updating ecosystem_orders:', e.message);
             }
               
             // Update meenzy_preorders and convert to ecosystem_orders
             try {
               // 1. Fetch all pending preorders for this user
               const { rows: preorders } = await client.query(`
                 SELECT id, ordered_item, quantity 
                 FROM coexistence.meenzy_preorders 
                 WHERE customer_phone = $1 AND order_status IN ('PENDING_CHECKOUT', 'CREATED', 'CONFIRMED', 'PENDING_MARKET')
               `, [r.contact_number]);
               
               if (preorders.length > 0) {
                 let totalPrice = 0;
                 const itemsData = [];
                 
                 // 2. Calculate prices from catalog
                 for (const po of preorders) {
                   const { rows: catRows } = await client.query(`SELECT price_in_inr FROM coexistence.meenzy_catalog WHERE item_name = $1`, [po.ordered_item]);
                   const pricePerKg = catRows.length > 0 ? catRows[0].price_in_inr : 800; // default to 800 if not found
                   const lineTotal = pricePerKg * po.quantity;
                   totalPrice += lineTotal;
                   itemsData.push({ id: po.id, name: po.ordered_item, qty: po.quantity, lineTotal });
                 }
                 
                 // 3. Create the ecosystem_order with Geocoding for Mapbox
                 const addressStr = `WhatsApp Pincode: ${pincode}`;
                 let lat = null, lng = null;
                 try {
                   const mapboxToken = 'pk.eyJ1IjoidmFzYW50aDAyMjMiLCJhIjoiY21xOGN4a2xnMDEwMjJwczl1MGhncHV1diJ9.NhbOSrL_XOGX6AUA3-wXQA';
                   const geoRes = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${pincode}%20India.json?access_token=${mapboxToken}&limit=1`);
                   const geoData = await geoRes.json();
                   if (geoData.features && geoData.features.length > 0) {
                     lng = geoData.features[0].center[0];
                     lat = geoData.features[0].center[1];
                   }
                 } catch (geoErr) {
                   console.error('[Geocode] Failed to fetch coordinates for pincode', pincode, geoErr.message);
                 }

                 const { rows: ecoRows } = await client.query(`
                   INSERT INTO coexistence.ecosystem_orders (user_phone, total_price, status, address_line, lat, lng)
                   VALUES ($1, $2, 'CREATED', $3, $4, $5)
                   RETURNING id
                 `, [r.contact_number, totalPrice, addressStr, lat, lng]);
                 const ecoOrderId = ecoRows[0].id;
                 
                 // 4. Insert items
                 for (const item of itemsData) {
                   await client.query(`
                     INSERT INTO coexistence.ecosystem_order_items (order_id, product_name, quantity, price)
                     VALUES ($1, $2, $3, $4)
                   `, [ecoOrderId, item.name, item.qty, item.lineTotal]);
                 }
                 
                 // 5. Mark preorders as converted
                 const idsToConvert = itemsData.map(i => i.id);
                 await client.query(`
                   UPDATE coexistence.meenzy_preorders 
                   SET order_status = 'CONVERTED', address_line = $1
                   WHERE id = ANY($2::bigint[])
                 `, [addressStr, idsToConvert]);
                 
                 updatedCount += preorders.length;
               }
             } catch (e) {
               console.error('[pincode-capture] Error converting preorders:', e.message);
             }
             
             if (updatedCount > 0) {
               const { resolveAccount, insertPendingRow } = require('../services/messageSender');
               const { enqueueSend } = require('../queue/sendQueue');
               const { account, error } = await resolveAccount({});
               if (!error && account) {
                 const text = `📍 Thanks! Your delivery Pincode (${pincode}) has been recorded.`;
                 const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'text', messageBody: text });
                 await enqueueSend({ kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
               }
               r.__handled = true;
             } else {
               const { resolveAccount, insertPendingRow } = require('../services/messageSender');
               const { enqueueSend } = require('../queue/sendQueue');
               const { account, error } = await resolveAccount({});
               if (!error && account) {
                 const text = `📍 I see you entered a Pincode (${pincode}), but I don't see an active order to attach it to! Please place your order first (e.g., "1kg rohu").`;
                 const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'text', messageBody: text });
                 await enqueueSend({ kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
               }
               r.__handled = true;
             }
          }
          
          if (!r.__handled && /^swap/i.test(trimmedBody)) {
            const swapTarget = trimmedBody.replace(/^swap\s+/i, '').trim().toLowerCase();
            
            let resolvedItem = null;
            if (swapTarget.includes('seer') || swapTarget.includes('vanjaram')) {
              resolvedItem = 'Seer Fish / Vanjaram';
            } else if (swapTarget.includes('pomfret')) {
              resolvedItem = 'Pomfret';
            } else if (swapTarget.includes('prawn') || swapTarget.includes('iral')) {
              resolvedItem = 'White Prawns / Iral';
            } else if (swapTarget.includes('rohu')) {
              resolvedItem = 'Rohu';
            }

            if (resolvedItem) {
              // Perform swap on preorders currently in AWAITING_SWAP_CHOICE status
              const updateRes = await client.query(
                `UPDATE coexistence.meenzy_preorders
                 SET ordered_item = $1, order_status = 'SWAPPED'
                 WHERE customer_phone = $2 AND order_status = 'AWAITING_SWAP_CHOICE'
                 RETURNING *`,
                [resolvedItem, r.contact_number]
              );

              if (updateRes.rows.length > 0) {
                console.log(`[meenzy-swap] Successfully swapped item to ${resolvedItem} for customer: ${r.contact_number}`);
                
                const { resolveAccount, insertPendingRow } = require('../services/messageSender');
                const { enqueueSend } = require('../queue/sendQueue');
                const { account, error } = await resolveAccount({});
                
                if (!error && account) {
                  const text = `✅ *Preorder Swapped Successfully!* ✅\n\nYour preorder has been updated to *${resolvedItem}*. It will be delivered as scheduled!`;
                  const localId = await insertPendingRow({
                    account, toNumber: r.contact_number, messageType: 'text', messageBody: text
                  });
                  await enqueueSend({
                    kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false }
                  });
                }
              }
            }
            r.__handled = true; // prevent evaluateTriggers
          } else {
             // Not SWAP, let's LLM triage
             if (!r.__handled) {
               // Fetch user preferences for hyper-personalization
               let prefs = null;
               try {
                 const { rows: prefRows } = await client.query(`SELECT preferences FROM coexistence.contacts WHERE contact_number = $1`, [r.contact_number]);
                 if (prefRows.length > 0) prefs = prefRows[0].preferences;
               } catch(e) {}

               const intent = await triageWithLLM(trimmedBody, prefs);
               
               // Fetch Autopilot Mode
               let isAutopilot = false;
               try {
                 const { rows: settingsRows } = await client.query(`SELECT value FROM coexistence.meenzy_settings WHERE key = 'ai_autopilot_mode'`);
                 if (settingsRows.length > 0) isAutopilot = settingsRows[0].value === true || settingsRows[0].value === 'true';
               } catch(e) {}

               if (intent === 'HUMAN_HANDOFF') {
                 if (isAutopilot) {
                   // Autopilot Mode: Do NOT pause the bot. The AI acts as the agent.
                   const { resolveAccount, insertPendingRow } = require('../services/messageSender');
                   const { enqueueSend } = require('../queue/sendQueue');
                   const { account } = await resolveAccount({});
                   if (account) {
                     const apiKey = process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY;
                     let text = "Our human agents are currently offline, but I am Meenzy's advanced AI support agent! 🤖 How can I help you right now?";
                     if (apiKey) {
                       try {
                         const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                           method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                           body: JSON.stringify({
                             model: "google/gemma-4-31b-it:free", max_tokens: 150,
                             messages: [{ role: "system", content: "You are an AI assistant for Meenzy Fresh Seafood. The user asked for a human, but humans are away. Apologize nicely and tell them you are an advanced AI here to assist them fully. Keep it under 2 sentences." }, { role: "user", content: trimmedBody }]
                           })
                         });
                         const data = await response.json();
                         if (data?.choices?.[0]?.message?.content) text = data.choices[0].message.content.trim();
                       } catch(e) {}
                     }
                     const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'text', messageBody: text });
                     await enqueueSend({ kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
                   }
                   console.log(`[llm-triage] Autopilot handled HUMAN_HANDOFF for ${r.contact_number}`);
                 } else {
                   // Manual Mode: Pause bot for 24 hours
                   await client.query(`
                     UPDATE coexistence.contacts 
                     SET tags = tags || '[{"id": 998, "name": "Human_Needed", "color": "#f59e0b"}]'::jsonb, 
                         bot_paused_until = NOW() + INTERVAL '24 hours',
                         updated_at = NOW()
                     WHERE contact_number = $1
                   `, [r.contact_number]);
                   
                   const { resolveAccount, insertPendingRow } = require('../services/messageSender');
                   const { enqueueSend } = require('../queue/sendQueue');
                   const { account } = await resolveAccount({});
                   if (account) {
                     const text = "I have paused my automated responses. A human from our team will chat with you shortly! 🧑‍💼 (Type 'resume bot' anytime to wake me up)";
                     const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'text', messageBody: text });
                     await enqueueSend({ kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
                   }
                   console.log(`[llm-triage] Flagged HUMAN_HANDOFF for ${r.contact_number}`);
                 }
                 r.__handled = true;
               } else if (intent === 'ORDER_COMPLAINT') {
                 await client.query(`
                   UPDATE coexistence.contacts 
                   SET tags = tags || '[{"id": 999, "name": "CRM_Followup", "color": "#ef4444"}]'::jsonb, updated_at = NOW()
                   WHERE contact_number = $1
                 `, [r.contact_number]);
                 
                 const { resolveAccount, insertPendingRow } = require('../services/messageSender');
                 const { enqueueSend } = require('../queue/sendQueue');
                 const { account, error } = await resolveAccount({});
                 if (!error && account) {
                   const { handleAIComplaintResolution } = require('../engine/aiComplaintResolver');
                   let text = await handleAIComplaintResolution(r.contact_number, trimmedBody);
                   
                   if (!text) {
                     text = "We are so sorry to hear you're experiencing an issue! 😔 We have flagged this as high priority and a senior manager will review it and message you shortly.";
                   }
                   
                   const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'text', messageBody: text });
                   await enqueueSend({ kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
                 }
                 console.log(`[llm-triage] Flagged ORDER_COMPLAINT for ${r.contact_number}`);
                 r.__handled = true;
               } else if (intent === 'PLACING_ORDER') {
                  const llmResponse = await extractOrderLLM(trimmedBody, prefs);
                  const items = llmResponse.items || [];
                  const dynamicReply = llmResponse.reply || `🤖 *AI Order Assistant*\n\nI've extracted the following items from your message:`;
                  
                  const { resolveAccount, insertPendingRow } = require('../services/messageSender');
                  const { enqueueSend } = require('../queue/sendQueue');
                  const { account, error } = await resolveAccount({});
                  
                  if (!error && account) {
                    if (items && items.length > 0) {
                      let confMsg = `${dynamicReply}\n\n`;
                      
                      const cartPayload = [];
                      for (const order of items) {
                        const qty = parseFloat(order.qty) || 1;
                        await client.query(
                          `INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status) VALUES ($1, $2, $3, $4)`,
                          [r.contact_number, order.item, qty, 'PENDING_CHECKOUT']
                        );
                        // Also mirror to temporary carts for abandonment tracking
                        await updateTemporaryCart(client, r.contact_number, order.item, qty, 'ai_intake_complete');
                        confMsg += `🐟 *${order.item}* - ${qty} Kg\n`;
                        cartPayload.push({ item: order.item, qty });
                      }
                      
                      const base64Cart = Buffer.from(JSON.stringify(cartPayload)).toString('base64');
                      const encodedCart = encodeURIComponent(base64Cart);
                      let checkoutUrl = await generateWixCheckoutUrl(cartPayload);
                      
                      // Fallback to our custom checkout page if Wix API fails or item not found
                      if (!checkoutUrl) {
                        checkoutUrl = `https://www.meenzy.in/cart-page?data=${encodedCart}&phone=${r.contact_number}`;
                      }

                      confMsg += `\nYour smart cart is ready! 🛒\n\nPlease click the link below to review your exact order details and securely checkout on our website:\n${checkoutUrl}\n\nThank you for choosing Meenzy Fresh Seafood! 🍽️`;
                      
                      const crossSell = await generateCrossSellLLM(cartPayload);
                      if (crossSell) {
                        confMsg += `\n\n${crossSell.message}`;
                      }

                      const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'text', messageBody: confMsg });
                      await enqueueSend({ kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { body: confMsg, previewUrl: true } });
                      
                    } else {
                      // Fallback if LLM couldn't extract items
                      const listPayload = {
                        type: "list",
                        body: { text: "It looks like you'd like to place an order! Could you please specify the exact fish and quantity (e.g., '1kg rohu')? Or click below to view our live catalog." },
                        action: {
                          button: "View Catalog",
                          sections: [{ title: "Seafood", rows: [{ id: "category_all", title: "🐟 View Catalog", description: "Browse all items" }] }]
                        }
                      };
                      const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'interactive', messageBody: 'LLM Intake Fallback: Catalog link' });
                      await enqueueSend({ kind: 'interactive', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { interactive: listPayload } });
                    }
                  }
                  r.__handled = true;
               } else if (intent === 'GENERAL_FAQ' || intent === 'DELIVERY_QUERY') {
                 const text = await generateFAQResponseLLM(trimmedBody);
                 if (text) {
                   const { resolveAccount, insertPendingRow } = require('../services/messageSender');
                   const { enqueueSend } = require('../queue/sendQueue');
                   const { account, error } = await resolveAccount({});
                   if (!error && account) {
                     const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'text', messageBody: text });
                     await enqueueSend({ kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
                   }
                   console.log(`[llm-triage] Sent dynamic FAQ response for ${r.contact_number}`);
                   r.__handled = true;
                 }
               } else if (intent === 'RECIPE_QUERY') {
                 const { generateRecipeLLM } = require('../engine/aiRecipeAssistant');
                 const text = await generateRecipeLLM(r.contact_number, trimmedBody);
                 if (text) {
                   const { resolveAccount, insertPendingRow } = require('../services/messageSender');
                   const { enqueueSend } = require('../queue/sendQueue');
                   const { account, error } = await resolveAccount({});
                   if (!error && account) {
                     const localId = await insertPendingRow({ account, toNumber: r.contact_number, messageType: 'text', messageBody: text });
                     await enqueueSend({ kind: 'text', accountId: account.id, to: String(r.contact_number).replace(/\D/g, ''), localMessageId: localId, payload: { body: text, previewUrl: false } });
                   }
                   console.log(`[llm-triage] Sent Recipe response for ${r.contact_number}`);
                   r.__handled = true;
                 }
               }
             }
          }
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Evaluate automation triggers
    const incomingRecords = allRecords.filter(r => r.direction === 'incoming' && r.message_type !== 'status' && r.message_type !== 'reaction' && !r.__handled);
    if (incomingRecords.length > 0) {
      for (const record of incomingRecords) {
        try {
          const { rows: pausedRows } = await pool.query(
            `SELECT id FROM coexistence.automation_executions
              WHERE wa_number=$1 AND contact_number=$2
                AND status='paused' AND expires_at>NOW()
              ORDER BY paused_at`,
            [record.wa_number, record.contact_number]
          );
          if (pausedRows.length > 0) {
            for (const p of pausedRows) {
              try {
                await resumeAutomation(pool, p.id, record);
              } catch (resumeErr) {
                console.error(`[webhook] Resume error for execution ${p.id}:`, resumeErr.message);
              }
            }
            continue; // do not also fire fresh triggers
          }
          await evaluateTriggers(record);
        } catch (triggerErr) {
          console.error('[webhook] Trigger evaluation error:', triggerErr.message);
        }
      }
    }

    // 2. For status updates (messageRead, messageDelivered, messageSent triggers)
    const statusRecords = allRecords.filter(r => r.message_type === 'status');
    if (statusRecords.length > 0) {
      for (const record of statusRecords) {
        try {
          await evaluateTriggers(record);
        } catch (triggerErr) {
          console.error('[webhook] Status trigger evaluation error:', triggerErr.message);
        }
      }
    }

    // Enqueue durable media downloads via BullMQ (concurrency-capped + retried)
    for (const r of allRecords) {
        if (['image', 'video', 'audio', 'voice', 'document', 'sticker'].includes(r.message_type)) {
          // Trigger download queue
          const { markPending, downloadOne } = require('../services/mediaDownloader');
          await markPending(r.message_id);
          
          if (r.message_type === 'audio' || r.message_type === 'voice') {
            downloadOne(r.message_id).then(async (result) => {
              if (result.ok && result.path && process.env.GROQ_API_KEY) {
                const path = require('path');
                const fs = require('fs');
                const ext = path.extname(result.path) || '.mp3';
                const filename = `audio${ext}`;
                const formData = new FormData();
                formData.append('file', new Blob([fs.readFileSync(result.path)]), filename);
                formData.append('model', 'whisper-large-v3');
                
                try {
                  console.log('[voice-order] Sending audio to Groq Whisper...');
                  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
                    body: formData
                  });
                  const data = await res.json();
                  if (data.text) {
                    const transcript = data.text;
                    console.log('[voice-order] Transcribed text:', transcript);
                    
                    const dummyReq = {
                      object: 'whatsapp_business_account',
                      entry: [{
                        changes: [{
                          value: {
                            messaging_product: 'whatsapp',
                            metadata: { phone_number_id: r.phone_number_id || '' },
                            contacts: [{ wa_id: r.wa_number, profile: { name: r.contact_name || '' } }],
                            messages: [{
                              from: r.contact_number,
                              id: 'voice_' + r.message_id,
                              timestamp: Math.floor(Date.now() / 1000).toString(),
                              type: 'text',
                              text: { body: transcript }
                            }]
                          }
                        }]
                      }]
                    };
                    
                    const headers = { 'Content-Type': 'application/json' };
                    if (process.env.META_APP_SECRET) {
                      const crypto = require('crypto');
                      const rawBody = JSON.stringify(dummyReq);
                      const signature = 'sha256=' + crypto.createHmac('sha256', process.env.META_APP_SECRET).update(rawBody).digest('hex');
                      headers['x-hub-signature-256'] = signature;
                    }
                    
                    fetch(`http://127.0.0.1:${process.env.PORT || 3001}/api/webhook/whatsapp`, {
                      method: 'POST',
                      headers: headers,
                      body: JSON.stringify(dummyReq)
                    }).catch(e => console.error('[voice-loopback] Error:', e.message));
                  }
                } catch (e) {
                  console.error('[voice-order] Transcription error:', e);
                }
              }
            }).catch(() => {});
          } else {
            downloadOne(r.message_id).catch(() => {});
          }
        }
    }

    console.log(`[webhook] Stored ${allRecords.length} record(s)`);
    res.status(200).json({ ok: true, stored: allRecords.length });
  } catch (err) {
    console.error('[webhook] Error:', err.message);
    res.status(200).json({ ok: false, error: 'Processing error' });
  }
});

/**
 * GET /api/webhook/whatsapp
 * Meta webhook verification endpoint (for direct Meta → ForgeChat webhooks).
 * Not needed for n8n forwarding, but included for completeness.
 */
router.get('/webhook/whatsapp', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  let accepted = false;
  if (mode === 'subscribe' && token) {
    try {
      const { rows } = await pool.query(
        `SELECT verify_token_encrypted FROM coexistence.whatsapp_accounts
          WHERE verify_token_encrypted IS NOT NULL`
      );
      for (const r of rows) {
        if (safeEqual(decrypt(r.verify_token_encrypted), token)) { accepted = true; break; }
      }
    } catch (err) {
      console.error('[webhook] verify-token lookup error:', err.message);
    }
    if (!accepted && process.env.META_WEBHOOK_VERIFY_TOKEN && safeEqual(process.env.META_WEBHOOK_VERIFY_TOKEN, token)) {
      accepted = true;
    }
  }

  if (accepted) {
    console.log('[webhook] Meta verification accepted');
    return res.status(200).type('text/plain').send(String(challenge ?? ''));
  }
  res.status(403).json({ error: 'Verification failed' });
});

/**
 * GET /api/public/catalog
 * Public endpoint to fetch all products for the custom web catalog.
 */
router.get('/public/catalog', async (req, res) => {
  try {
    const products = await fetchCatalogProducts();
    const mapped = products.map(p => {
      let cats = [];
      const lower = p.name.toLowerCase();
      if (lower.match(/fish|catla|rohu|mackerel|sardine|pomfret|murrel|kalavai|keluthi|carp|tilapia/i)) cats.push('fishes');
      if (lower.match(/squid|kanava/i)) cats.push('squid');
      if (lower.match(/cleaned|curry cut|peeled|slices|steak/i)) cats.push('instant_buy');
      if (lower.match(/combo|pack/i)) cats.push('combos');
      if (lower.match(/boneless|fillet/i)) cats.push('boneless');
      if (lower.match(/fry|deep fry/i)) cats.push('deep_fry_favorites');
      if (lower.match(/tuna|salmon|mackerel|halibut|snapper|seer|koduva/i)) cats.push('high_protein');
      if (lower.match(/lean|low/i)) cats.push('lean_low_calorie');
      if (lower.match(/prawn|crab|lobster|shrimp|kooni/i)) cats.push('shell_foods');
      
      return {
        id: p.id,
        title: p.name,
        description: p.description,
        price: p.price,
        image_url: p.image_url || 'https://images.unsplash.com/photo-1615141982883-c7add0e69741',
        categories: cats
      };
    });
    
    res.json(mapped.length > 0 ? mapped : catalogProducts);
  } catch (err) {
    console.error('[public-catalog] Error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve catalog' });
  }
});

/**
 * POST /api/public/checkout
 * Public checkout endpoint that receives the cart and places a PostgreSQL preorder.
 * Sends a detailed WhatsApp order confirmation summary with item images / prices.
 */
router.post('/public/checkout', async (req, res) => {
  const { phone, items } = req.body;
  if (!phone || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Phone number and cart items are required' });
  }

  try {
    const { resolveAccount, insertPendingRow } = require('../services/messageSender');
    const { enqueueSend } = require('../queue/sendQueue');
    const { account, error } = await resolveAccount({});

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of items) {
        await client.query(
          `INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity)
           VALUES ($1, $2, $3)`,
          [phone, item.title, parseFloat(item.quantity)]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    if (!error && account) {
      const itemsSummary = items.map(item => `• *${item.title}* (${item.quantity} Kg) - ₹${item.price}/Kg`).join('\n');
      const total = items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);
      const confText = `🐟 *Meenzy Order Registered!* 🛒\n\nYour preorder has been successfully registered:\n\n${itemsSummary}\n\n💵 *Total Price*: *₹${total}*\n\nOnce we verify availability in today's fresh market catch, we will confirm and notify you!\n\nThank you! 🍽️`;

      if (items.length === 1) {
        const product = items[0];
        const localId = await insertPendingRow({
          account, toNumber: phone, messageType: 'image', messageBody: confText, mediaUrl: product.image_url
        });
        await enqueueSend({
          kind: 'media', accountId: account.id, to: String(phone).replace(/\D/g, ''), localMessageId: localId, payload: { type: 'image', link: product.image_url, caption: confText }
        });
      } else {
        const localId = await insertPendingRow({
          account, toNumber: phone, messageType: 'text', messageBody: confText
        });
        await enqueueSend({
          kind: 'text', accountId: account.id, to: String(phone).replace(/\D/g, ''), localMessageId: localId, payload: { body: confText, previewUrl: false }
        });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[public-checkout] Error:', err.message);
    res.status(500).json({ error: 'Internal server error during checkout' });
  }
});

/**
 * POST /api/webhook/wix-order
 * Generic webhook endpoint to receive website orders and send WhatsApp confirmations.
 */
const crypto = require('crypto');

/**
 * POST /api/webhook/wix-order
 * Receives website orders, validates HMAC, saves to DB, and sends WhatsApp confirmations.
 */
router.post('/webhook/wix-order', async (req, res) => {
  let client;
  try {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const signature = req.headers['x-wix-signature'];
    
    // 1. HMAC Verification
    if (process.env.WIX_WEBHOOK_SECRET) {
      if (!signature) {
        return res.status(401).json({ error: 'Missing signature' });
      }
      const hmac = crypto.createHmac('sha256', process.env.WIX_WEBHOOK_SECRET);
      hmac.update(rawBody);
      const expectedSignature = hmac.digest('base64');
      if (signature !== expectedSignature) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const payload = req.body;
    console.log('[wix-order-webhook] Received order webhook:', JSON.stringify(payload, null, 2));

    const order = payload.order || payload.data?.order || payload.data || payload;
    const orderId = order.id || order.orderId || order.number;

    if (!orderId) {
      return res.status(400).json({ error: 'Missing order ID in payload' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    // 2. Idempotency Check
    const { rows: idemRows } = await client.query(`
      SELECT 1 FROM coexistence.ecosystem_idempotency_keys WHERE idempotency_key = $1
    `, [`wix_order_${orderId}`]);

    if (idemRows.length > 0) {
      await client.query('ROLLBACK');
      client.release();
      console.log(`[wix-order-webhook] Order ${orderId} already processed (idempotency).`);
      return res.json({ ok: true, message: 'Already processed' });
    }

    // 3. Extract Order Details
    let phone = order.billingInfo?.contactDetails?.phone || order.billingInfo?.phone || order.buyerInfo?.phone || order.customerPhone || payload.phone;
    if (!phone) {
      await client.query('ROLLBACK');
      console.error('[wix-order-webhook] No phone number found in payload.');
      return res.status(400).json({ error: 'No phone number found' });
    }

    // Normalize phone number to standard international format (assuming Indian +91 if ambiguous)
    phone = String(phone).replace(/\D/g, '');
    if (phone.length === 10) {
      phone = '91' + phone;
    } else if (phone.length === 11 && phone.startsWith('0')) {
      phone = '91' + phone.substring(1);
    }

    const lineItems = order.lineItems || payload.items || [];
    const total = order.priceSummary?.total?.value || order.totals?.total || order.totalPrice || lineItems.reduce((acc, curr) => acc + parseFloat(curr.price?.value || curr.totalPrice?.value || curr.price || curr.totalPrice || 0), 0);
    
    // Extract address safely
    let addressObj = order.shippingInfo?.logistics?.shippingDestination?.address || order.billingInfo?.address || {};
    let addressLine = addressObj.formattedAddress;
    if (!addressLine) {
      const parts = [addressObj.addressLine, addressObj.city, addressObj.subdivisionFullname || addressObj.subdivision, addressObj.postalCode, addressObj.countryFullname || addressObj.country].filter(Boolean);
      addressLine = parts.join(', ');
    }

    // 3.5 Geocode the address
    const { geocodeAddress } = require('../services/geocoder');
    const geo = await geocodeAddress(addressLine);
    const lat = geo ? geo.lat : null;
    const lng = geo ? geo.lng : null;

    // 4. Save to Database
    const { rows: savedOrder } = await client.query(`
      INSERT INTO coexistence.ecosystem_orders (wix_order_id, user_phone, total_price, status, address_line, lat, lng)
      VALUES ($1, $2, $3, 'CREATED', $4, $5, $6)
      RETURNING id
    `, [String(orderId), String(phone), total, addressLine, lat, lng]);

    const internalOrderId = savedOrder[0].id;

    const itemsSummary = [];
    for (const item of lineItems) {
      const name = item.itemName || item.name || item.title || 'Item';
      const qty = item.quantity || 1;
      const price = item.price?.value || item.totalPrice?.value || item.price || item.totalPrice || 0;
      
      await client.query(`
        INSERT INTO coexistence.ecosystem_order_items (order_id, product_name, quantity, price)
        VALUES ($1, $2, $3, $4)
      `, [internalOrderId, name, qty, price]);

      // Sync to Preorders page
      await client.query(`
        INSERT INTO coexistence.meenzy_preorders (customer_phone, ordered_item, quantity, order_status)
        VALUES ($1, $2, $3, 'pending_market')
      `, [String(phone).replace(/\D/g, ''), name, qty]);

      itemsSummary.push(`• *${name}* x${qty} - ₹${price}`);
    }

    // Save Idempotency Key
    await client.query(`
      INSERT INTO coexistence.ecosystem_idempotency_keys (idempotency_key, event_type)
      VALUES ($1, 'wix_order_created')
    `, [`wix_order_${orderId}`]);

    await client.query('COMMIT');

    // 5. Sync to Wix Utility Placeholder
    // async function syncToWix(orderId, status) { /* implementation requires Wix API keys */ }

    // 6. Send WhatsApp Confirmation
    const trackingPhone = String(phone).replace(/\D/g, '').slice(-4);
    const trackingLink = `${process.env.CORS_ORIGIN}/#/track/${orderId}?phone=${trackingPhone}`;

    const messageText = `Thank you for your order! 🌊 (Order #${orderId})\n\nBecause we source our seafood fresh daily, your order is currently marked as a *Preorder*.\n\n*Requested Items:*\n${itemsSummary.join('\n')}\n\n💵 *Total:* ₹${total}\n\nYour order has been registered. We will check for the availability and then we will send you the confirmation message soon!\n\n📍 *Track your order live:*\n${trackingLink}`;

    const { resolveAccount, insertPendingRow } = require('../services/messageSender');
    const { enqueueSend } = require('../queue/sendQueue');
    const { account, error } = await resolveAccount({});

    if (!error && account) {
      const normalizedPhone = String(phone).replace(/\D/g, '');
      
      const interactivePayload = {
        type: "button",
        body: { text: messageText },
        action: {
          buttons: [
            { type: "reply", reply: { id: `cancel_wix_order_${orderId}`, title: "Cancel Order ❌" } }
          ]
        }
      };

      const localId = await insertPendingRow({
        account,
        toNumber: normalizedPhone,
        messageType: 'interactive',
        messageBody: 'Sent website order confirmation with cancellation option',
      });
      await enqueueSend({
        kind: 'interactive',
        accountId: account.id,
        to: normalizedPhone,
        localMessageId: localId,
        payload: { interactive: interactivePayload }
      });
      console.log(`[wix-order-webhook] Successfully enqueued order confirmation for ${normalizedPhone}`);
    } else {
      console.error('[wix-order-webhook] Failed to resolve WhatsApp account:', error);
    }

    res.status(200).json({ ok: true, message: 'Order processed successfully' });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch(e) {}
      client.release();
    }
    console.error('[wix-order-webhook] Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = { router, fetchCatalogProducts };
