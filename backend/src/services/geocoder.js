/**
 * Geocodes an address string to latitude and longitude using Nominatim (OpenStreetMap).
 * Respects Nominatim usage policy (requires User-Agent).
 * @param {string} address - The address to geocode.
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function geocodeAddress(address) {
  if (!address) return null;
  
  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (mapboxToken) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${mapboxToken}&limit=1`;
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const [lng, lat] = data.features[0].center;
          console.log(`[Geocoder] Mapbox resolved "${address}" -> Lat: ${lat}, Lng: ${lng}`);
          return { lat, lng };
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
