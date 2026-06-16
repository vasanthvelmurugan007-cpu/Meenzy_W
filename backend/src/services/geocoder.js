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

  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (mapboxToken) {
    try {
      // 1. Try full address
      let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mapboxToken}&limit=1`;
      let response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        let data = await response.json();
        if (data.features && data.features.length > 0) {
          const feature = data.features[0];
          // If relevance is good, use it
          if (feature.relevance >= 0.7 || !pincode) {
            const [lng, lat] = feature.center;
            console.log(`[Geocoder] Mapbox resolved full address "${address}" (relevance: ${feature.relevance}) -> Lat: ${lat}, Lng: ${lng}`);
            return { lat, lng };
          }
          console.log(`[Geocoder] Mapbox low relevance (${feature.relevance}) for "${address}". Falling back to pincode.`);
        }
      }
      
      // 2. Fallback to pincode if available
      if (pincode) {
        url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(pincode + ', India')}.json?access_token=${mapboxToken}&limit=1`;
        response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (response.ok) {
          let data = await response.json();
          if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            const [lng, lat] = feature.center;
            console.log(`[Geocoder] Mapbox resolved pincode "${pincode}" -> Lat: ${lat}, Lng: ${lng}`);
            return { lat, lng };
          }
        }
      }
    } catch (error) {
      console.error('[Geocoder] Mapbox error, falling back to Nominatim:', error.message);
    }
  }

  // Fallback to Nominatim (OpenStreetMap)
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
