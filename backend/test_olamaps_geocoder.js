const axios = require('axios');

// Using the Client ID and Client Secret from your screenshot
const CLIENT_ID = 'd474c47d-b72f-4312-851f-0cc64d93080e';
const CLIENT_SECRET = 'ba216658050a4325b5dc132e0c9d81be';

async function getAccessToken() {
    console.log("Fetching OAuth Token...");
    const url = 'https://api.olamaps.io/auth/v1/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CLIENT_ID);
    params.append('client_secret', CLIENT_SECRET);

    try {
        const response = await axios.post(url, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error fetching access token:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function testOlaMapsGeocoding(address) {
    try {
        const token = await getAccessToken();
        console.log(`Successfully obtained token. Now testing Geocoding for: "${address}"`);
        
        const response = await axios.get('https://api.olamaps.io/places/v1/geocode', {
            params: {
                address: address
            },
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Request-Id': `test-req-${Date.now()}`
            }
        });

        if (response.data && response.data.geocodingResults && response.data.geocodingResults.length > 0) {
            console.log("\nSuccess! Here is the top result:");
            const result = response.data.geocodingResults[0];
            console.log(`Formatted Address: ${result.formatted_address}`);
            console.log(`Latitude: ${result.geometry.location.lat}`);
            console.log(`Longitude: ${result.geometry.location.lng}`);
            console.log(`Location Type: ${result.types ? result.types.join(', ') : 'N/A'}`);
            console.log("\nFull Raw Result for reference:");
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log("No results found for this address.");
            console.log("Full response:", JSON.stringify(response.data, null, 2));
        }

    } catch (error) {
        console.error("\nError calling Ola Maps API:");
        if (error.response) {
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

// Test with a complex Indian address
const testAddress = "No 16 A, Rani Velu Nachiyar St, Sri Kamatchi Amman Nagar Extension, Potheri East, Chengalpattu District, Tamil Nadu - 603203, chennai, Tamil Nadu, 603203, India";
testOlaMapsGeocoding(testAddress);
