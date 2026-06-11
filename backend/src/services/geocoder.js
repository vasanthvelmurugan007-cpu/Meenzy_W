/**
 * Geocodes an address string to latitude and longitude using Nominatim (OpenStreetMap).
 * Respects Nominatim usage policy (requires User-Agent).
 * @param {string} address - The address to geocode.
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function geocodeAddress(address) {
  if (!address) return null;
  
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
        return {
          lat: parseFloat(lat),
          lng: parseFloat(lon) // Note: Nominatim returns 'lon' instead of 'lng'
        };
      }
    }
    return null;
  } catch (error) {
    console.error('[Geocoder] Error geocoding address:', error.message);
    return null;
  }
}

module.exports = {
  geocodeAddress
};
