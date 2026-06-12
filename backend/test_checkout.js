require('dotenv').config();
const { processCheckout } = require('./src/routes/meenzy');

async function run() {
  console.log('Testing processCheckout...');
  await processCheckout('919845444003', [], '2150289245547170');
  console.log('Finished processCheckout');
  process.exit(0);
}

run();
