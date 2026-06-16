/**
 * Geocodes an address string to latitude and longitude using Nominatim (OpenStreetMap).
 * Respects Nominatim usage policy (requires User-Agent).
 * @param {string} address - The address to geocode.
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function geocodeAddress(address) {
  if (!address) return null;
  
  // Extract pincode (6 digits for India)
  const pincodeMatch = address.match(/\b\d{6}\b/);
  const pincode = pincodeMatch ? pincodeMatch[0] : null;

  const openCageKey = process.env.OPENCAGE_API_KEY;
  if (openCageKey) {
    try {
      // 1. Try full address
      let url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(address)}&key=${openCageKey}&limit=1`;
      let response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        let data = await response.json();
        if (data.results && data.results.length > 0) {
          const result = data.results[0];
          const { lat, lng } = result.geometry;
          // OpenCage provides confidence score (10 is best, 1 is worst)
          if (result.confidence >= 5 || !pincode) {
            console.log(`[Geocoder] OpenCage resolved full address "${address}" (confidence: ${result.confidence}) -> Lat: ${lat}, Lng: ${lng}`);
            return { lat, lng };
          }
          console.log(`[Geocoder] OpenCage low confidence (${result.confidence}) for "${address}". Falling back to pincode.`);
        }
      }
      
      // 2. Fallback to pincode if available
      if (pincode) {
        url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(pincode + ', India')}&key=${openCageKey}&limit=1`;
        response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          let data = await response.json();
          if (data.results && data.results.length > 0) {
            const { lat, lng } = data.results[0].geometry;
            console.log(`[Geocoder] OpenCage resolved pincode "${pincode}" -> Lat: ${lat}, Lng: ${lng}`);
            return { lat, lng };
          }
        }
      }
    } catch (error) {
      console.error('[Geocoder] OpenCage error, falling back to Nominatim:', error.message);
    }
  }

  // Fallback to Nominatim (OpenStreetMap) if OpenCage key is missing or fails
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ForgeCRM/1.0 (Delivery Routing Engine)'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        console.log(`[Geocoder] Nominatim resolved "${address}" -> Lat: ${lat}, Lng: ${lon}`);
        return {
          lat: parseFloat(lat),
          lng: parseFloat(lon)
        };
      }
    }
    return null;
  } catch (error) {
    console.error('[Geocoder] Nominatim error:', error.message);
    return null;
  }
}

module.exports = {
  geocodeAddress
};
