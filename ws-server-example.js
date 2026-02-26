// WebSocket Server for Shoonya Market Data
// Save this as ws-server/server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store active subscriptions
const subscriptions = new Map();

io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);

  // Handle subscription requests
  socket.on('subscribe', ({ symbols }) => {
    console.log(`📊 Subscribe request for:`, symbols);
    
    symbols.forEach(({ symbol, exchange }) => {
      const key = `${exchange}:${symbol}`;
      
      if (!subscriptions.has(key)) {
        subscriptions.set(key, new Set());
        
        // Start mock market data stream
        // In production, connect to Shoonya WebSocket here
        startMockDataStream(key);
      }
      
      subscriptions.get(key).add(socket.id);
    });

    socket.emit('subscribed', { 
      status: 'success', 
      symbols 
    });
  });

  // Handle unsubscribe requests
  socket.on('unsubscribe', ({ symbols }) => {
    console.log(`🔕 Unsubscribe request for:`, symbols);
    
    symbols.forEach(({ symbol, exchange }) => {
      const key = `${exchange}:${symbol}`;
      const subscribers = subscriptions.get(key);
      
      if (subscribers) {
        subscribers.delete(socket.id);
        
        if (subscribers.size === 0) {
          subscriptions.delete(key);
          // Stop data stream for this symbol
        }
      }
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
    
    // Remove client from all subscriptions
    subscriptions.forEach((subscribers, key) => {
      subscribers.delete(socket.id);
      
      if (subscribers.size === 0) {
        subscriptions.delete(key);
      }
    });
  });
});

// Mock data stream (replace with actual Shoonya WebSocket)
function startMockDataStream(symbolKey) {
  const [exchange, symbol] = symbolKey.split(':');
  
  setInterval(() => {
    const subscribers = subscriptions.get(symbolKey);
    
    if (subscribers && subscribers.size > 0) {
      const mockData = {
        symbol: symbolKey,
        ltp: Math.random() * 1000 + 15000, // Random LTP
        bid: 0,
        ask: 0,
        bidQty: 0,
        askQty: 0,
        volume: Math.floor(Math.random() * 100000),
        open: 15200,
        high: 15400,
        low: 15000,
        close: 15300,
        change: Math.random() * 100 - 50,
        changePercentage: Math.random() * 2 - 1
      };

      // Broadcast to all subscribers
      subscribers.forEach(socketId => {
        io.to(socketId).emit('market_data', mockData);
      });
    }
  }, 1000); // Update every second
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    connections: io.engine.clientsCount,
    subscriptions: subscriptions.size
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 WebSocket Server running on port ${PORT}`);
  console.log(`📡 Ready to accept connections from trading terminal`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
