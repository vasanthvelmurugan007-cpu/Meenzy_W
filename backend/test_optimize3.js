require('dotenv').config();

async function test() {
  const currentLat = "13.0";
  const currentLng = "77.5";
  
  // Create 15 dummy orders (more than 11)
  const validOrders = [];
  for (let i = 0; i < 15; i++) {
    validOrders.push({ id: `order_${i}`, lat: `${13.01 + (i * 0.01)}`, lng: `${77.51 + (i * 0.01)}` });
  }

  const startLat = parseFloat(currentLat);
  const startLng = parseFloat(currentLng);
  const missingOrders = [];

  // THE EXACT CODE FROM agentPortal.js
    let optimizedSequence = [];
    let currentStartLat = startLat;
    let currentStartLng = startLng;
    
    // Create a mutable copy of validOrders
    const pendingOrders = [...validOrders];

    while (pendingOrders.length > 0) {
      const batchOrders = pendingOrders.splice(0, 11); // Take up to 11 orders
      const hub = { id: 'hub', lat: currentStartLat, lng: currentStartLng };
      
      const locations = [
        hub,
        ...batchOrders.map(o => ({
          id: o.id,
          lat: parseFloat(o.lat),
          lng: parseFloat(o.lng)
        }))
      ];

      const coordinateString = locations.map(loc => `${loc.lng},${loc.lat}`).join(';');
      const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinateString}?source=first&destination=any&roundtrip=true&access_token=${process.env.MAPBOX_ACCESS_TOKEN}`;

      const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
      const data = await response.json();

      if (!response.ok || data.code !== 'Ok') {
        console.error(`[Mapbox Error] ${response.status}: ${data.message || JSON.stringify(data)}`);
        // Fallback: append the rest unoptimized
        optimizedSequence.push(...batchOrders.map(o => o.id));
        optimizedSequence.push(...pendingOrders.map(o => o.id));
        break;
      }

      const sortedLocations = new Array(locations.length);
      data.waypoints.forEach((waypoint, originalIndex) => {
          sortedLocations[waypoint.waypoint_index] = locations[originalIndex];
      });

      let batchSequence = sortedLocations
        .filter(loc => loc && loc.id !== 'hub')
        .map(loc => loc.id);

      // Mapbox roundtrip anomaly fix for this batch
      if (batchSequence.length > 1) {
        const firstId = batchSequence[0];
        const lastId = batchSequence[batchSequence.length - 1];
        
        const firstLoc = batchOrders.find(o => o.id === firstId);
        const lastLoc = batchOrders.find(o => o.id === lastId);
        
        if (firstLoc && lastLoc) {
          const distToFirst = Math.pow(currentStartLat - parseFloat(firstLoc.lat), 2) + Math.pow(currentStartLng - parseFloat(firstLoc.lng), 2);
          const distToLast = Math.pow(currentStartLat - parseFloat(lastLoc.lat), 2) + Math.pow(currentStartLng - parseFloat(lastLoc.lng), 2);
          
          if (distToLast < distToFirst) {
             batchSequence.reverse();
          }
        }
      }

      optimizedSequence.push(...batchSequence);

      // Set the last order of this batch as the start location for the next batch
      if (batchSequence.length > 0) {
        const lastOrderId = batchSequence[batchSequence.length - 1];
        const lastOrder = batchOrders.find(o => o.id === lastOrderId);
        if (lastOrder) {
          currentStartLat = parseFloat(lastOrder.lat);
          currentStartLng = parseFloat(lastOrder.lng);
        }
      }
    }

    const finalSequence = [...optimizedSequence, ...missingOrders];
    console.log("FINAL:", finalSequence);
}

test();
