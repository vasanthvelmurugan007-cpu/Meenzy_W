const products = [
  {"id":"2f5ef1d5-a0f4-4a36-b6f9-fcc5d07b25ca","productId":"6379b06d-e76e-4844-b422-209ac3a6ec19","name":"Koduva Fish / Barramundi - Fillet(𝗚𝗿𝗼𝘀𝘀: 𝟳𝟱𝟬𝗴, 𝗡𝗲𝘁: 𝟯𝟱𝟬𝗴)","price":"999.00","retailer_id":"2f5ef1d5-a0f4-4a36-b6f9-fcc5d07b25ca"},
  {"id":"3878af97-cea2-40fd-9c54-dc450d923c9a","productId":"d67ab1af-d007-40f9-88db-b9fb11c06b97","name":"Sankara - Whole(𝗡𝗲𝘁: 𝟱𝟬𝟬𝗴) + Black Pomfret - Sliced(𝗡𝗲𝘁: 𝟱𝟬𝟬𝗴)","price":"1399.00","retailer_id":"3878af97-cea2-40fd-9c54-dc450d923c9a"},
  {"id":"0bb59be8-f961-4afb-b88f-9dce198288de","productId":"49dda92e-3491-4e4b-9a1a-1fed0a2bd744","name":"Tuna / Soorai - (𝗚𝗿𝗼𝘀𝘀: 𝟳𝟱𝟬𝗴, 𝗡𝗲𝘁: 𝟱𝟬𝟬𝗴)","price":"699.00","retailer_id":"0bb59be8-f961-4afb-b88f-9dce198288de"}
];

const filtered = products.filter(p => p.name.toLowerCase().match(/seer|salmon|tuna|snake head|shrimp|pomfret|barracuda|sardine|squid|prawn|mahi|snapper|mackerel|trevally|anchovy/i));
const itemsToShow = filtered.length > 0 ? filtered.slice(0, 10) : products.slice(0, 10);
const rows = itemsToShow.map(p => {
  const cleanName = p.name.split(/[\/\-\(]/)[0].trim().substring(0, 24);
  return {
    id: `order_${p.retailer_id || p.id}`,
    title: cleanName,
    description: `₹${p.price}/Kg`.substring(0, 72)
  };
});
console.log(rows);
