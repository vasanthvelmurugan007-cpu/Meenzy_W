const validOrders = [
  { id: '1', lat: 12.971598, lng: 77.594562, name: 'MG Road' }, // Center
  { id: '2', lat: 12.925453, lng: 77.546757, name: 'Banashankari' }, // South
  { id: '3', lat: 13.006822, lng: 77.581335, name: 'Malleswaram' } // North
];

// Let's say agent location is Laggere
const startLat = 13.0135;
const startLng = 77.5147;

let unvisited = [...validOrders];
const finalOptimized = [];

let currentPoint = { lat: startLat, lng: startLng };

while (unvisited.length > 0) {
  let nearestIdx = -1;
  let minDistance = Infinity;

  for (let i = 0; i < unvisited.length; i++) {
    const order = unvisited[i];
    const dist = Math.pow(currentPoint.lat - parseFloat(order.lat), 2) + Math.pow(currentPoint.lng - parseFloat(order.lng), 2);
    
    if (dist < minDistance) {
      minDistance = dist;
      nearestIdx = i;
    }
  }

  const nearestOrder = unvisited[nearestIdx];
  finalOptimized.push(nearestOrder.id);
  currentPoint = { lat: parseFloat(nearestOrder.lat), lng: parseFloat(nearestOrder.lng) };
  unvisited.splice(nearestIdx, 1);
}

console.log("Nearest Neighbor Sequence:", finalOptimized);
