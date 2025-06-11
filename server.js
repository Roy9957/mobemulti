const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const shortid = require('shortid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Game state
const rooms = {};

// Generate a unique room ID
function generateRoomId() {
  return shortid.generate();
}

// Create a player object
function createPlayer() {
  return {
    x: Math.random() * 400 + 200,
    y: Math.random() * 200 + 100,
    width: 50,
    height: 50,
    health: 100,
    speed: 8,
    lastFire: 0,
    color: `hsl(${Math.random() * 360}, 100%, 50%)`
  };
}

io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);

  // Handle joining a room
  socket.on('joinRoom', (roomId) => {
    if (!roomId || typeof roomId !== 'string') {
      socket.emit('error', { message: 'Invalid room ID' });
      return;
    }

    if (!rooms[roomId]) {
      // Create new room with first player
      rooms[roomId] = {
        players: {},
        bullets: [],
        explosions: [],
        status: 'waiting' // waiting, playing, full
      };
      
      const playerId = socket.id;
      rooms[roomId].players[playerId] = createPlayer();
      rooms[roomId].status = 'waiting';
      
      socket.join(roomId);
      socket.emit('joinedRoom', {
        roomId,
        playerId,
        isFirstPlayer: true,
        gameState: rooms[roomId]
      });
      
      console.log(`Player ${playerId} created room ${roomId}`);
    } else if (rooms[roomId].status === 'waiting' && Object.keys(rooms[roomId].players).length === 1) {
      // Add second player
      const playerId = socket.id;
      rooms[roomId].players[playerId] = createPlayer();
      rooms[roomId].status = 'playing';
      
      socket.join(roomId);
      socket.emit('joinedRoom', {
        roomId,
        playerId,
        isFirstPlayer: false,
        gameState: rooms[roomId]
      });
      
      // Notify both players that game has started
      io.to(roomId).emit('gameStarted', rooms[roomId]);
      console.log(`Player ${playerId} joined room ${roomId}`);
    } else {
      // Room is full
      socket.emit('roomFull');
      console.log(`Player ${socket.id} tried to join full room ${roomId}`);
    }
  });

  // Handle player movement
  socket.on('playerUpdate', (data) => {
    const { roomId, playerId, x, y } = data;
    if (!rooms[roomId] || !rooms[roomId].players[playerId]) {
      console.warn(`Invalid playerUpdate: roomId=${roomId}, playerId=${playerId}`);
      return;
    }
    
    rooms[roomId].players[playerId].x = x;
    rooms[roomId].players[playerId].y = y;
    
    // Broadcast to other player
    socket.to(roomId).emit('playerMoved', { playerId, x, y });
  });

  // Handle firing bullets
  socket.on('fireBullet', (data) => {
    const { roomId, playerId, x, y, direction } = data;
    if (!rooms[roomId] || !rooms[roomId].players[playerId]) {
      console.warn(`Invalid fireBullet: roomId=${roomId}, playerId=${playerId}`);
      return;
    }
    
    const now = Date.now();
    const player = rooms[roomId].players[playerId];
    
    if (now - player.lastFire > 300) { // Rate limiting
      player.lastFire = now;
      const bullet = {
        x,
        y,
        width: 8,
        height: 20,
        speed: 10,
        playerId,
        direction,
        id: shortid.generate()
      };
      
      rooms[roomId].bullets.push(bullet);
      io.to(roomId).emit('bulletFired', bullet);
    }
  });

  // Handle player hit
  socket.on('hitPlayer', (data) => {
    const { roomId, playerId, bulletId } = data;
    if (!rooms[roomId] || !rooms[roomId].players[playerId]) {
      console.warn(`Invalid hitPlayer: roomId=${roomId}, playerId=${playerId}`);
      return;
    }
    
    rooms[roomId].players[playerId].health -= 10;
    
    // Remove the bullet
    rooms[roomId].bullets = rooms[roomId].bullets.filter(b => b.id !== bulletId);
    
    // Check if player is dead
    if (rooms[roomId].players[playerId].health <= 0) {
      // Create explosion
      const explosion = {
        x: rooms[roomId].players[playerId].x,
        y: rooms[roomId].players[playerId].y,
        size: 40,
        alpha: 1,
        id: shortid.generate()
      };
      
      rooms[roomId].explosions.push(explosion);
      io.to(roomId).emit('explosion', explosion);
      
      // Notify game over
      const winnerId = Object.keys(rooms[roomId].players).find(id => id !== playerId);
      io.to(roomId).emit('gameOver', { winnerId });
      
      // Clean up room after delay
      setTimeout(() => {
        delete rooms[roomId];
        console.log(`Room ${roomId} cleaned up`);
      }, 10000);
    } else {
      // Update health
      io.to(roomId).emit('playerHealth', { playerId, health: rooms[roomId].players[playerId].health });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // Find and remove the player from all rooms
    for (const roomId in rooms) {
      if (rooms[roomId].players[socket.id]) {
        // Notify other player
        io.to(roomId).emit('playerDisconnected', socket.id);
        
        // Clean up room
        delete rooms[roomId];
        console.log(`Room ${roomId} cleaned up due to disconnection`);
        break;
      }
    }
  });
});

// Create a new game room
app.get('/new', (req, res) => {
  const roomId = generateRoomId();
  res.redirect(`/play?id=${roomId}`);
});

// Root route that redirects to /new
app.get('/', (req, res) => {
  res.redirect('/new');
});

// Join a game room
app.get('/play', (req, res) => {
  const roomId = req.query.id;
  if (!roomId || !/^[a-zA-Z0-9_-]{4,}$/.test(roomId)) {
    return res.redirect('/new');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
