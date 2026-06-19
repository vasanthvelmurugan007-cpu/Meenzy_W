require('dotenv').config();

async function test() {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  
  const locations = [
    { lng: 80.2863, lat: 13.0883 }, // Chennai Parrys
    { lng: 80.2741, lat: 13.0782 }, // Chennai Mount Road
    { lng: 77.5401, lat: 13.0089 }  // Bangalore
  ];
  
  const coordinateString = locations.map(loc => `${loc.lng},${loc.lat}`).join(';');
  const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinateString}?source=first&destination=any&roundtrip=true&access_token=${token}`;

  const response = await fetch(url);
  const data = await response.json();
  
  console.log('Response:', data.code, data.message);
}

test();
