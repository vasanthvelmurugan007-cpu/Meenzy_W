require('dotenv').config();

async function test() {
  const currentLat = "13.0";
  const currentLng = "77.5";
  const validOrders = [
    { id: '1', lat: "13.01", lng: "77.51" },
    { id: '2', lat: "13.05", lng: "77.55" },
    { id: '3', lat: "13.02", lng: "77.52" },
  ];

  const startLat = parseFloat(currentLat);
  const startLng = parseFloat(currentLng);
  const hub = { id: 'hub', lat: startLat, lng: startLng };
  
  const locations = [
    hub,
    ...validOrders.map(o => ({
      id: o.id,
      lat: parseFloat(o.lat),
      lng: parseFloat(o.lng)
    }))
  ];

  const coordinateString = locations.map(loc => `${loc.lng},${loc.lat}`).join(';');
  const sourceParam = 'first';
  const destinationParam = 'any';
  const isRoundTrip = 'true';

  const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinateString}?source=${sourceParam}&destination=${destinationParam}&roundtrip=${isRoundTrip}&access_token=${process.env.MAPBOX_ACCESS_TOKEN}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.code !== 'Ok') {
    console.error('Error', data);
    return;
  }

  const sortedLocations = new Array(locations.length);
  
  data.waypoints.forEach((waypoint, originalIndex) => {
      sortedLocations[waypoint.waypoint_index] = locations[originalIndex];
  });

  let optimizedSequence = sortedLocations
    .filter(loc => loc && loc.id !== 'hub')
    .map(loc => loc.id);

  console.log("Original orders:", validOrders.map(o=>o.id));
  console.log("Mapbox output:", optimizedSequence);

  if (optimizedSequence.length > 1) {
    const firstId = optimizedSequence[0];
    const lastId = optimizedSequence[optimizedSequence.length - 1];
    
    const firstLoc = validOrders.find(o => o.id === firstId);
    const lastLoc = validOrders.find(o => o.id === lastId);
    
    if (firstLoc && lastLoc) {
      const distToFirst = Math.pow(startLat - parseFloat(firstLoc.lat), 2) + Math.pow(startLng - parseFloat(firstLoc.lng), 2);
      const distToLast = Math.pow(startLat - parseFloat(lastLoc.lat), 2) + Math.pow(startLng - parseFloat(lastLoc.lng), 2);
      
      console.log('Dist to First:', distToFirst);
      console.log('Dist to Last:', distToLast);

      if (distToLast < distToFirst) {
         optimizedSequence.reverse();
         console.log("Reversed!");
      }
    }
  }

  console.log("Final Output:", optimizedSequence);
}

test();
