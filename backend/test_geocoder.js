require('dotenv').config();
const { geocodeAddress } = require('./src/services/geocoder');

async function test() {
  const addr1 = "62, Matha Koil 3rd Cross St, Kattankulathur, Tamil Nadu, 603203, India";
  const addr2 = "No 16 A, Rani Velu Nachiyar St, Sri Kamatchi Amman Nagar Entension, Potheri East, Chengalpattu District, Tamil Nadu - 603203, chennai, Tamil Nadu, 603203, India";

  console.log("Testing Addr 1...");
  const res1 = await geocodeAddress(addr1);
  console.log("Result 1:", res1);

  console.log("\nTesting Addr 2...");
  const res2 = await geocodeAddress(addr2);
  console.log("Result 2:", res2);
}

test();
