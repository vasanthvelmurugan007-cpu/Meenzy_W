const axios = require('axios');

class OlaMapsService {
  constructor() {
    this.clientId = process.env.OLA_MAPS_CLIENT_ID || 'd474c47d-b72f-4312-851f-0cc64d93080e';
    this.clientSecret = process.env.OLA_MAPS_CLIENT_SECRET || 'ba216658050a4325b5dc132e0c9d81be';
    // Fallback to API Key if client ID is missing
    this.apiKey = process.env.OLA_MAPS_API_KEY;
    this.token = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    // If we only have API key, we don't need a token
    if (this.apiKey && !this.clientId) return null;

    // Return cached token if valid
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    if (!this.clientId || !this.clientSecret) {
      if (!this.apiKey) {
        console.warn('[OlaMapsService] Neither Client Credentials nor API Key are set');
      }
      return null;
    }

    const url = 'https://api.olamaps.io/auth/v1/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', this.clientId);
    params.append('client_secret', this.clientSecret);

    try {
      const response = await axios.post(url, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      this.token = response.data.access_token;
      // Usually tokens expire in 1 hour (3600 seconds). We subtract 5 mins for buffer.
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = Date.now() + (expiresIn - 300) * 1000;
      return this.token;
    } catch (error) {
      console.error('[OlaMapsService] Error fetching OAuth token:', error.response ? error.response.data : error.message);
      return null;
    }
  }

  /**
   * Optimizes a route given a list of coordinates.
   * @param {Array<{lat: number, lng: number}>} coordinates
   * @returns {Promise<number[]>} The optimized sequence of indices (waypoint_order)
   */
  async optimizeRoute(coordinates) {
    if (!coordinates || coordinates.length < 2) {
      return coordinates.map((_, i) => i);
    }

    const token = await this.getAccessToken();
    const url = 'https://api.olamaps.io/routing/v1/routeOptimizer';
    
    // Format: lat,lng|lat,lng
    const locationsString = coordinates.map(c => `${c.lat},${c.lng}`).join('|');
    
    const requestUrl = this.apiKey && !token 
      ? `${url}?locations=${locationsString}&api_key=${this.apiKey}` 
      : `${url}?locations=${locationsString}`;
      
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    if (!token && !this.apiKey) return coordinates.map((_, i) => i);

    try {
      const response = await axios.post(requestUrl, null, { headers });

      const data = response.data;
      if (data.status === 'SUCCESS' && data.routes && data.routes.length > 0) {
        return data.routes[0].waypoint_order;
      } else {
        console.warn('[OlaMapsService] Route optimization failed or returned no routes', data);
        return coordinates.map((_, i) => i);
      }
    } catch (error) {
      console.error('[OlaMapsService] Error calling routeOptimizer:', error.response ? error.response.data : error.message);
      return coordinates.map((_, i) => i);
    }
  }

  /**
   * Geocodes an address to coordinates
   * @param {string} address
   * @returns {Promise<{lat: number, lng: number} | null>}
   */
  async geocode(address) {
    const token = await this.getAccessToken();
    const url = 'https://api.olamaps.io/places/v1/geocode';

    if (!token && !this.apiKey) return null;

    const params = { address };
    if (this.apiKey && !token) params.api_key = this.apiKey;
    
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const response = await axios.get(url, { params, headers });

      const data = response.data;
      if (data && data.geocodingResults && data.geocodingResults.length > 0) {
        const result = data.geocodingResults[0];
        return {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
          formattedAddress: result.formatted_address
        };
      }
      return null;
    } catch (error) {
      console.error('[OlaMapsService] Error calling geocode:', error.response ? error.response.data : error.message);
      return null;
    }
  }
}

module.exports = new OlaMapsService();

