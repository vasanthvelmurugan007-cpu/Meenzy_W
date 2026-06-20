let io = null;

module.exports = {
  init: (server) => {
    const { Server } = require('socket.io');
    io = new Server(server, {
      cors: {
        origin: '*', // Already restricted by Express CORS for HTTP
        methods: ['GET', 'POST']
      }
    });

    io.on('connection', (socket) => {
      console.log(`[Socket.io] Client connected: ${socket.id}`);
      
      // Agents join a specific room to receive live order updates
      socket.on('join_delivery_agents', () => {
        socket.join('delivery-agents');
        console.log(`[Socket.io] Client ${socket.id} joined 'delivery-agents'`);
      });

      socket.on('disconnect', () => {
        console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      });
    });

    return io;
  },
  getIO: () => {
    if (!io) {
      console.warn('[Socket.io] Warning: getIO called before init!');
    }
    return io;
  }
};
