/**
 * Geocodes an address string to latitude and longitude.
 * Strategy: pincode-first for Indian addresses (6-digit), then full address.
 * Adds countrycode=IN to all OpenCage queries to prevent cross-country mismatches.
 * @param {string} address - The address to geocode.
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function geocodeAddress(address) {
  if (!address) return null;
  
  // Extract pincode (6 digits for India)
  const pincodeMatch = address.match(/\b(\d{6})\b/);
  const pincode = pincodeMatch ? pincodeMatch[1] : null;

  const openCageKey = process.env.OPENCAGE_API_KEY;
  let result = null;

  if (openCageKey) {
    try {
      // ── Strategy 1: Pincode-first (most accurate for messy Indian addresses) ──
      if (pincode) {
        const pincodeUrl = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(pincode + ', India')}&key=${openCageKey}&limit=1&countrycode=in`;
        const pincodeResp = await fetch(pincodeUrl, { signal: AbortSignal.timeout(5000) });
        if (pincodeResp.ok) {
          const pincodeData = await pincodeResp.json();
          if (pincodeData.results && pincodeData.results.length > 0) {
            const r = pincodeData.results[0];
            const { lat, lng } = r.geometry;
            if (lat >= 6 && lat <= 37 && lng >= 68 && lng <= 97) {
              console.log(`[Geocoder] OpenCage pincode "${pincode}" -> Lat: ${lat}, Lng: ${lng}`);
              result = { lat, lng };
            }
          }
        }
      }

      // ── Strategy 2: Full Address Geocoding ──
      if (!result) {
        const fullUrl = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(address)}&key=${openCageKey}&limit=1&countrycode=in`;
        const fullResp = await fetch(fullUrl, { signal: AbortSignal.timeout(5000) });
        if (fullResp.ok) {
          const fullData = await fullResp.json();
          if (fullData.results && fullData.results.length > 0) {
            const r = fullData.results[0];
            const { lat, lng } = r.geometry;
            if (lat >= 6 && lat <= 37 && lng >= 68 && lng <= 97 && r.confidence >= 5) {
              console.log(`[Geocoder] OpenCage full address -> Lat: ${lat}, Lng: ${lng}`);
              result = { lat, lng };
            }
          }
        }
      }
    } catch (error) {
      console.error('[Geocoder] OpenCage error, falling back to Nominatim:', error.message);
    }
  }

  // ── Fallback: Nominatim (OpenStreetMap) ──
  if (!result) {
    try {
      const query = pincode ? `${pincode}, India` : address;
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=in`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'ForgeCRM/1.0 (Delivery Routing Engine)' },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          const { lat, lon } = data[0];
          console.log(`[Geocoder] Nominatim resolved "${query}" -> Lat: ${lat}, Lng: ${lon}`);
          result = { lat: parseFloat(lat), lng: parseFloat(lon) };
        }
      }
    } catch (error) {
      console.error('[Geocoder] Nominatim error:', error.message);
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
