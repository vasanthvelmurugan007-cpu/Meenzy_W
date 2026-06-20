const olaMapsService = require('./olaMapsService');

/**
 * Geocodes an address string to latitude and longitude.
 * Strategy: AI Address Sanitization -> Ola Maps Geocoding
 * @param {string} address - The address to geocode.
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function geocodeAddress(address) {
  if (!address) return null;
  
  // Extract pincode (6 digits for India)
  const pincodeMatch = address.match(/\b(\d{6})\b/);
  const pincode = pincodeMatch ? pincodeMatch[1] : null;

  const groqKey = process.env.GROQ_API_KEY;
  let result = null;

  // ── AI Address Sanitization ──
  let cleanedAddress = address;
  if (groqKey && address.length > 20) {
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama3-8b-8192",
          messages: [{ role: "user", content: `Extract ONLY the town/locality, city, and pincode from this messy Indian address. Return ONLY a clean comma-separated string like "Kattankulathur, Chennai, 603203". Do not include door numbers, street names, or any other text. Address: ${address}` }],
          temperature: 0,
          max_tokens: 20
        }),
        signal: AbortSignal.timeout(3000)
      });
      if (resp.ok) {
        const json = await resp.json();
        const content = json.choices[0]?.message?.content?.trim();
        if (content && !content.toLowerCase().includes('cannot') && content.length < 50) {
          cleanedAddress = content.replace(/["']/g, '');
          console.log(`[Geocoder] AI Cleaned Address: "${address}" -> "${cleanedAddress}"`);
        }
      }
    } catch(e) {
      console.error('[Geocoder] AI cleanup failed:', e.message);
    }
  }

  // ── Strategy 1: Ola Maps Cleaned Address Geocoding ──
  try {
    const geoData = await olaMapsService.geocode(cleanedAddress);
    if (geoData) {
      console.log(`[Geocoder] Ola Maps resolved "${cleanedAddress}" -> Lat: ${geoData.lat}, Lng: ${geoData.lng}`);
      result = { lat: geoData.lat, lng: geoData.lng };
    }
  } catch (error) {
    console.error('[Geocoder] Ola Maps address error:', error.message);
  }

  // ── Strategy 2: Ola Maps Pincode Fallback ──
  if (!result && pincode) {
    try {
      const geoData = await olaMapsService.geocode(`${pincode}, India`);
      if (geoData) {
        console.log(`[Geocoder] Ola Maps pincode "${pincode}" -> Lat: ${geoData.lat}, Lng: ${geoData.lng}`);
        result = { lat: geoData.lat, lng: geoData.lng };
      }
    } catch (error) {
      console.error('[Geocoder] Ola Maps pincode error:', error.message);
    }
  }

  if (result) {
    // Add Jitter (~50-100m) to prevent exact overlaps for same pincode
    const jitterLat = (Math.random() - 0.5) * 0.001; 
    const jitterLng = (Math.random() - 0.5) * 0.001;
    return { 
      lat: result.lat + jitterLat, 
      lng: result.lng + jitterLng 
    };
  }
  
  return null;
}

module.exports = {
  geocodeAddress
};
