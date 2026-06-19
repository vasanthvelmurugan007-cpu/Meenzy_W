require('dotenv').config();
const { geocodeAddress } = require('./src/services/geocoder');

async function test() {
  const res = await geocodeAddress("9TH CROSS RAJGOPAL NAGARA MAIN ROAD GANAPATHINAGAR 04 560058");
  console.log("Result:", res);
}

test();
