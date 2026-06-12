const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1IjoidmFzYW50aDAyMjMiLCJhIjoiY21xOGN4a2xnMDEwMjJwczl1MGhncHV1diJ9.NhbOSrL_XOGX6AUA3-wXQA';
const coordinateString = '77.5375,13.0039;77.546474,12.997504;77.53673,13.010324;77.55,13.02';

const test = async () => {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinateString}?alternatives=true&overview=full&geometries=geojson&access_token=${MAPBOX_ACCESS_TOKEN}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.routes) {
     console.log(`Returned ${json.routes.length} routes.`);
  } else {
     console.log(json);
  }
}
test();
