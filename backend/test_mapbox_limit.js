require('dotenv').config();

async function test() {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  
  const locations = [];
  for (let i = 0; i < 15; i++) {
    locations.push({ lng: 77.5 + (i * 0.001), lat: 13.0 + (i * 0.001) });
  }
  
  const coordinateString = locations.map(loc => `${loc.lng},${loc.lat}`).join(';');
  const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinateString}?source=first&destination=any&roundtrip=true&access_token=${token}`;

  const response = await fetch(url);
  const data = await response.json();
  
  console.log('Response:', data);
}

test();
