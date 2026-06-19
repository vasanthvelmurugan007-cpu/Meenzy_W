require('dotenv').config();

async function test() {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  
  const locations = [
    { lng: 77.519416, lat: 12.998491 }, // A (hub)
    { lng: 77.5401, lat: 13.008898 },   // B
    { lng: 77.5222, lat: 13.0033 }      // C
  ];
  
  const coordinateString = locations.map(loc => `${loc.lng},${loc.lat}`).join(';');
  const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinateString}?source=first&destination=any&roundtrip=false&access_token=${token}`;

  const response = await fetch(url);
  const data = await response.json();
  
  console.log('Response:', data);
}

test();
