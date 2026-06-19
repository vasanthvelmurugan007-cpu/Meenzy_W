require('dotenv').config();

async function test() {
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  
  // MG Road, Banashankari, Malleswaram
  const locations = [
    { id: '1', lat: 12.971598, lng: 77.594562 }, // Hub / MG Road
    { id: '2', lat: 12.925453, lng: 77.546757 }, // Banashankari
    { id: '3', lat: 13.006822, lng: 77.581335 }  // Malleswaram
  ];
  
  const coordinateString = locations.map(loc => `${loc.lng},${loc.lat}`).join(';');
  const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinateString}?source=first&destination=any&roundtrip=true&access_token=${token}`;

  const response = await fetch(url);
  const data = await response.json();
  
  const sortedLocations = new Array(locations.length);
  data.waypoints.forEach((waypoint, originalIndex) => {
      sortedLocations[waypoint.waypoint_index] = locations[originalIndex];
  });

  let batchSequence = sortedLocations
    .filter(loc => loc && loc.id !== '1')
    .map(loc => loc.id);

  console.log("Original Mapbox Sequence:", batchSequence);

  // Anomaly fix
  if (batchSequence.length > 1) {
    const firstId = batchSequence[0];
    const lastId = batchSequence[batchSequence.length - 1];
    
    const firstLoc = locations.find(o => o.id === firstId);
    const lastLoc = locations.find(o => o.id === lastId);
    
    if (firstLoc && lastLoc) {
      const distToFirst = Math.pow(locations[0].lat - parseFloat(firstLoc.lat), 2) + Math.pow(locations[0].lng - parseFloat(firstLoc.lng), 2);
      const distToLast = Math.pow(locations[0].lat - parseFloat(lastLoc.lat), 2) + Math.pow(locations[0].lng - parseFloat(lastLoc.lng), 2);
      
      console.log(`Dist Hub->First (${firstId}):`, distToFirst);
      console.log(`Dist Hub->Last (${lastId}):`, distToLast);

      if (distToLast < distToFirst) {
         batchSequence.reverse();
         console.log("Reversed!");
      }
    }
  }

  console.log('Final Sequence:', batchSequence);
}

test();
