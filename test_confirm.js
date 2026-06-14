const id = "11";
fetch(`https://meenzy-frontend.onrender.com/api/meenzy/preorders/${id}/confirm`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}).then(async res => {
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Body:", text);
}).catch(console.error);
