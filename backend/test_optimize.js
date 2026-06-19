require('dotenv').config();

async function test() {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) return console.log('No token');
  
  const locations = [
    { lng: 77.519416, lat: 12.998491 }, // A
    { lng: 77.5401, lat: 13.008898 },   // B
    { lng: 77.5222, lat: 13.0033 }      // C
  ];
  
  const coordinateString = locations.map(loc => `${loc.lng},${loc.lat}`).join(';');
  const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinateString}?source=first&destination=any&roundtrip=true&access_token=${token}`;

  console.log('URL:', url);
  const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  const data = await response.json();
  
  console.log('Response:', JSON.stringify(data, null, 2));
}

test();
