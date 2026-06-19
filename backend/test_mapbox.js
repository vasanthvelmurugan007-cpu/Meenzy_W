require('dotenv').config();

async function test() {
  const address = "9TH CROSS RAJGOPAL NAGARA MAIN ROAD GANAPATHINAGAR 04 560058";
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${process.env.MAPBOX_ACCESS_TOKEN}&limit=1`;
  const response = await fetch(url);
  const data = await response.json();
  console.log(JSON.stringify(data.features[0], null, 2));
}

test();
