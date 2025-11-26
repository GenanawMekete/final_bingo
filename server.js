import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Game state storage
const gameRooms = new Map();
const playerConnections = new Map();
const activeIntervals = new Map();

// Generate Bingo card
function generateBingoCard() {
  const ranges = [
    { min: 1, max: 15, letter: 'B' },
    { min: 16, max: 30, letter: 'I' },
    { min: 31, max: 45, letter: 'N' },
    { min: 46, max: 60, letter: 'G' },
    { min: 61, max: 75, letter: 'O' }
  ];

  const card = [];
  for (let col = 0; col < 5; col++) {
    const numbers = generateColumnNumbers(ranges[col].min, ranges[col].max);
    for (let row = 0; row < 5; row++) {
      const index = row * 5 + col;
      if (row === 2 && col === 2) {
        card.push({ number: 'FREE', isFree: true, row, col, index, letter: ranges[col].letter });
      } else {
        card.push({ number: numbers[row], isFree: false, row, col, index, letter: ranges[col].letter });
      }
    }
  }
  return card;
}

function generateColumnNumbers(min, max) {
  const numbers = [];
  while (numbers.length < 5) {
    const num = Math.floor(Math.random() * (max - min + 1)) + min;
    if (!numbers.includes(num)) numbers.push(num);
  }
  return numbers.sort((a, b) => a - b);
}

// Generate card pool for a game
function generateCardPool(gameId, poolSize = 20) {
  const pool = [];
  for (let i = 0; i < poolSize; i++) {
    pool.push(generateBingoCard());
  }
  return pool;
}

// Check win conditions
function checkWinCondition(markedCells) {
  // Condition 1: Any row OR any column
  const hasCompleteRow = checkRows(markedCells);
  const hasCompleteColumn = checkColumns(markedCells);
  const condition1 = hasCompleteRow || hasCompleteColumn;

  // Condition 2: Both diagonals
  const condition2 = checkBothDiagonals(markedCells);

  // Condition 3: Four corners
  const condition3 = checkFourCorners(markedCells);

  return condition1 || condition2 || condition3;
}

function checkRows(markedCells) {
  for (let row = 0; row < 5; row++) {
    let complete = true;
    for (let col = 0; col < 5; col++) {
      const index = row * 5 + col;
      if (index !== 12 && !markedCells.has(index)) complete = false;
    }
    if (complete) return true;
  }
  return false;
}

function checkColumns(markedCells) {
  for (let col = 0; col < 5; col++) {
    let complete = true;
    for (let row = 0; row < 5; row++) {
      const index = row * 5 + col;
      if (index !== 12 && !markedCells.has(index)) complete = false;
    }
    if (complete) return true;
  }
  return false;
}

function checkBothDiagonals(markedCells) {
  // Main diagonal (0,0 to 4,4)
  let mainComplete = true;
  const mainDiagonal = [0, 6, 12, 18, 24];
  for (const index of mainDiagonal) {
    if (index !== 12 && !markedCells.has(index)) mainComplete = false;
  }

  // Anti-diagonal (0,4 to 4,0)
  let antiComplete = true;
  const antiDiagonal = [4, 8, 12, 16, 20];
  for (const index of antiDiagonal) {
    if (index !== 12 && !markedCells.has(index)) antiComplete = false;
  }

  return mainComplete && antiComplete;
}

function checkFourCorners(markedCells) {
  const corners = [0, 4, 20, 24];
  return corners.every(index => markedCells.has(index));
}

// Get card preview for selection
function getCardPreview(card) {
  const preview = {
    B: card.filter(c => c.col === 0 && !c.isFree).slice(0, 3).map(c => c.number),
    I: card.filter(c => c.col === 1 && !c.isFree).slice(0, 3).map(c => c.number),
    N: card.filter(c => c.col === 2 && !c.isFree).slice(0, 3).map(c => c.number),
    G: card.filter(c => c.col === 3 && !c.isFree).slice(0, 3).map(c => c.number),
    O: card.filter(c => c.col === 4 && !c.isFree).slice(0, 3).map(c => c.number)
  };
  return preview;
}

// API Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Multiplayer Bingo Backend', 
    status: 'running',
    features: ['card-selection', 'manual-bingo-claim', 'multiplayer']
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    games: gameRooms.size
  });
});

app.get('/api/stats', (req, res) => {
  const stats = {
    activeGames: gameRooms.size,
    totalPlayers: Array.from(gameRooms.values()).reduce((sum, room) => sum + room.players.size, 0),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
  res.json(stats);
});

app.post('/api/game/create', (req, res) => {
  const { playerName, playerId } = req.body;
  
  if (!playerName || !playerId) {
    return res.status(400).json({ error: 'Player name and ID are required' });
  }

  const gameId = uuidv4().slice(0, 8).toUpperCase();
  
  const gameRoom = {
    id: gameId,
    host: playerId,
    players: new Map(),
    calledNumbers: [],
    isGameActive: false,
    createdAt: Date.now(),
    cardPool: generateCardPool(gameId, 20),
    bingoClaims: new Map()
  };

  gameRooms.set(gameId, gameRoom);
  
  console.log(`Game ${gameId} created by ${playerName}`);
  
  res.json({
    success: true,
    gameId,
    message: 'Game created successfully'
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create new game room
  socket.on('create-game', (data) => {
    const { playerName, playerId } = data;
    const gameId = uuidv4().slice(0, 8).toUpperCase();
    
    const gameRoom = {
      id: gameId,
      host: playerId,
      players: new Map(),
      calledNumbers: [],
      isGameActive: false,
      createdAt: Date.now(),
      cardPool: generateCardPool(gameId, 20),
      bingoClaims: new Map()
    };

    gameRooms.set(gameId, gameRoom);
    
    // Add host to game
    joinGame(socket, gameId, playerId, playerName);
    
    socket.emit('game-created', { 
      gameId, 
      message: 'Game created successfully! Share the code with friends.' 
    });
    
    console.log(`Game ${gameId} created by ${playerName}`);
  });

  // Join existing game
  socket.on('join-game', (data) => {
    const { gameId, playerId, playerName } = data;
    joinGame(socket, gameId, playerId, playerName);
  });

  function joinGame(socket, gameId, playerId, playerName) {
    const gameRoom = gameRooms.get(gameId);
    
    if (!gameRoom) {
      socket.emit('error', { message: 'Game not found!' });
      return;
    }

    if (gameRoom.players.size >= 8) {
      socket.emit('error', { message: 'Game is full! Maximum 8 players allowed.' });
      return;
    }

    if (gameRoom.isGameActive) {
      socket.emit('error', { message: 'Game has already started!' });
      return;
    }

    // Create player without a card initially
    const player = {
      id: playerId,
      name: playerName,
      socketId: socket.id,
      card: null,
      markedCells: new Set([12]), // FREE space is always marked
      isHost: playerId === gameRoom.host,
      hasSelectedCard: false,
      hasClaimedBingo: false,
      joinedAt: Date.now()
    };

    // Add player to game
    gameRoom.players.set(playerId, player);
    playerConnections.set(socket.id, { gameId, playerId });

    // Join socket room
    socket.join(gameId);

    // Send card pool to player
    socket.emit('card-pool', {
      cards: gameRoom.cardPool.map((card, index) => ({
        id: index,
        preview: getCardPreview(card)
      }))
    });

    // Send game state to the joining player
    socket.emit('game-joined', {
      game: {
        id: gameRoom.id,
        host: gameRoom.host,
        isGameActive: gameRoom.isGameActive,
        calledNumbers: gameRoom.calledNumbers,
        players: Array.from(gameRoom.players.values()).map(p => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          hasSelectedCard: p.hasSelectedCard,
          markedCount: p.markedCells.size
        }))
      },
      player: {
        id: player.id,
        name: player.name,
        isHost: player.isHost
      }
    });

    // Notify other players
    socket.to(gameId).emit('player-joined', {
      player: {
        id: player.id,
        name: player.name,
        isHost: player.isHost,
        hasSelectedCard: player.hasSelectedCard
      },
      players: Array.from(gameRoom.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        hasSelectedCard: p.hasSelectedCard,
        markedCount: p.markedCells.size
      }))
    });

    console.log(`Player ${playerName} joined game ${gameId}`);
  }

  // Player selects a card from the pool
  socket.on('select-card', (data) => {
    const { gameId, cardId } = data;
    const connection = playerConnections.get(socket.id);
    
    if (!connection) return;
    
    const gameRoom = gameRooms.get(gameId);
    if (!gameRoom) return;

    const player = gameRoom.players.get(connection.playerId);
    if (!player) return;

    if (player.hasSelectedCard) {
      socket.emit('error', { message: 'You have already selected a card!' });
      return;
    }

    if (cardId < 0 || cardId >= gameRoom.cardPool.length) {
      socket.emit('error', { message: 'Invalid card selection!' });
      return;
    }

    // Assign the selected card to player
    player.card = gameRoom.cardPool[cardId];
    player.hasSelectedCard = true;

    socket.emit('card-selected', {
      success: true,
      card: player.card
    });

    socket.to(gameId).emit('player-card-selected', {
      playerId: player.id,
      playerName: player.name
    });

    // Check if all players have selected cards
    checkAllPlayersReady(gameRoom);

    console.log(`Player ${player.name} selected card ${cardId} in game ${gameId}`);
  });

  // Start game
  socket.on('start-game', (data) => {
    const { gameId } = data;
    const connection = playerConnections.get(socket.id);
    
    if (!connection) return;
    
    const gameRoom = gameRooms.get(gameId);
    if (!gameRoom || gameRoom.host !== connection.playerId) {
      socket.emit('error', { message: 'Only the host can start the game!' });
      return;
    }

    if (gameRoom.players.size < 2) {
      socket.emit('error', { message: 'Need at least 2 players to start!' });
      return;
    }

    // Check if all players have selected cards
    const allPlayersReady = Array.from(gameRoom.players.values()).every(p => p.hasSelectedCard);
    if (!allPlayersReady) {
      socket.emit('error', { message: 'Not all players have selected cards yet!' });
      return;
    }

    gameRoom.isGameActive = true;
    gameRoom.startedAt = Date.now();

    // Start number calling
    startNumberCalling(gameId);

    io.to(gameId).emit('game-started', {
      startedAt: gameRoom.startedAt,
      calledNumbers: gameRoom.calledNumbers
    });

    console.log(`Game ${gameId} started with ${gameRoom.players.size} players`);
  });

  // Mark cell
  socket.on('mark-cell', (data) => {
    const { gameId, cellIndex } = data;
    const connection = playerConnections.get(socket.id);
    
    if (!connection) return;
    
    const gameRoom = gameRooms.get(gameId);
    if (!gameRoom || !gameRoom.isGameActive) return;

    const player = gameRoom.players.get(connection.playerId);
    if (!player || !player.hasSelectedCard) return;

    // Validate the cell can be marked
    const cell = player.card.find(c => c.index === cellIndex);
    if (!cell || cell.isFree) {
      socket.emit('error', { message: 'Invalid cell!' });
      return;
    }

    // Check if number has been called
    if (!gameRoom.calledNumbers.includes(cell.number)) {
      socket.emit('error', { message: `Number ${cell.number} hasn't been called yet!` });
      return;
    }

    // Check if cell is already marked
    if (player.markedCells.has(cellIndex)) {
      socket.emit('error', { message: 'Cell already marked!' });
      return;
    }

    // Mark the cell
    player.markedCells.add(cellIndex);

    // Notify player
    socket.emit('cell-marked', {
      cellIndex,
      markedCount: player.markedCells.size
    });

    // Notify other players about progress
    socket.to(gameId).emit('player-marked-cell', {
      playerId: player.id,
      markedCount: player.markedCells.size
    });

    console.log(`Player ${player.name} marked cell ${cellIndex} in game ${gameId}`);
  });

  // Player claims Bingo
  socket.on('claim-bingo', (data) => {
    const { gameId } = data;
    const connection = playerConnections.get(socket.id);
    
    if (!connection) return;
    
    const gameRoom = gameRooms.get(gameId);
    if (!gameRoom || !gameRoom.isGameActive) return;

    const player = gameRoom.players.get(connection.playerId);
    if (!player) return;

    if (player.hasClaimedBingo) {
      socket.emit('error', { message: 'You have already claimed Bingo!' });
      return;
    }

    // Validate the Bingo claim
    if (checkWinCondition(player.markedCells)) {
      player.hasClaimedBingo = true;
      
      const bingoClaim = {
        playerId: player.id,
        playerName: player.name,
        timestamp: Date.now(),
        markedCells: Array.from(player.markedCells)
      };

      gameRoom.bingoClaims.set(player.id, bingoClaim);

      // Notify all players about the Bingo claim
      io.to(gameId).emit('bingo-claimed', bingoClaim);

      console.log(`Player ${player.name} claimed Bingo in game ${gameId}`);
    } else {
      socket.emit('error', { message: 'No valid winning pattern found!' });
    }
  });

  // Host verifies Bingo claim
  socket.on('verify-bingo', (data) => {
    const { gameId, playerId, isValid } = data;
    const connection = playerConnections.get(socket.id);
    
    if (!connection) return;
    
    const gameRoom = gameRooms.get(gameId);
    if (!gameRoom || gameRoom.host !== connection.playerId) {
      socket.emit('error', { message: 'Only the host can verify Bingo!' });
      return;
    }

    const claim = gameRoom.bingoClaims.get(playerId);
    if (!claim) {
      socket.emit('error', { message: 'No Bingo claim found for this player!' });
      return;
    }

    if (isValid) {
      // Valid Bingo - game over
      gameRoom.isGameActive = false;
      gameRoom.winner = playerId;
      gameRoom.finishedAt = Date.now();

      // Stop number calling
      if (activeIntervals.has(gameId)) {
        clearInterval(activeIntervals.get(gameId));
        activeIntervals.delete(gameId);
      }

      io.to(gameId).emit('bingo-verified', {
        winner: {
          id: claim.playerId,
          name: claim.playerName,
          markedCells: claim.markedCells
        },
        isValid: true,
        message: `🎉 ${claim.playerName} wins with a valid Bingo! 🎉`
      });

      console.log(`Bingo verified for ${claim.playerName} in game ${gameId}`);
    } else {
      // Invalid claim
      gameRoom.bingoClaims.delete(playerId);
      const player = gameRoom.players.get(playerId);
      if (player) player.hasClaimedBingo = false;

      io.to(gameId).emit('bingo-verified', {
        winner: null,
        isValid: false,
        message: `${claim.playerName}'s Bingo claim was invalid`
      });
    }
  });

  // Chat message
  socket.on('send-chat', (data) => {
    const { gameId, message } = data;
    const connection = playerConnections.get(socket.id);
    
    if (!connection) return;
    
    const gameRoom = gameRooms.get(gameId);
    if (!gameRoom) return;

    const player = gameRoom.players.get(connection.playerId);
    if (!player) return;

    const trimmedMessage = message.toString().trim().slice(0, 200);
    if (trimmedMessage.length === 0) return;

    io.to(gameId).emit('chat-message', {
      playerId: player.id,
      playerName: player.name,
      message: trimmedMessage,
      timestamp: Date.now()
    });
  });

  // Leave game
  socket.on('leave-game', () => {
    const connection = playerConnections.get(socket.id);
    if (connection) {
      leaveGame(socket, connection.gameId, connection.playerId);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const connection = playerConnections.get(socket.id);
    if (connection) {
      leaveGame(socket, connection.gameId, connection.playerId);
    }
  });

  function leaveGame(socket, gameId, playerId) {
    const gameRoom = gameRooms.get(gameId);
    
    if (gameRoom) {
      const player = gameRoom.players.get(playerId);
      
      // Remove player
      gameRoom.players.delete(playerId);
      
      // Notify other players
      socket.to(gameId).emit('player-left', {
        playerId: playerId,
        playerName: player?.name,
        players: Array.from(gameRoom.players.values()).map(p => ({
          id: p.id,
          name: p.name,
          isHost: p.isHost,
          hasSelectedCard: p.hasSelectedCard
        }))
      });

      // Clean up empty games
      if (gameRoom.players.size === 0) {
        if (activeIntervals.has(gameId)) {
          clearInterval(activeIntervals.get(gameId));
          activeIntervals.delete(gameId);
        }
        gameRooms.delete(gameId);
        console.log(`Game ${gameId} deleted (no players)`);
      } else if (playerId === gameRoom.host) {
        // Assign new host
        const newHost = Array.from(gameRoom.players.values())[0];
        gameRoom.host = newHost.id;
        newHost.isHost = true;
        
        io.to(gameId).emit('new-host', { 
          hostId: newHost.id, 
          hostName: newHost.name 
        });
      }
    }
    
    playerConnections.delete(socket.id);
    
    if (player) {
      console.log(`Player ${player.name} left game ${gameId}`);
    }
  }

  function startNumberCalling(gameId) {
    const gameRoom = gameRooms.get(gameId);
    if (!gameRoom) return;

    // Clear any existing interval
    if (activeIntervals.has(gameId)) {
      clearInterval(activeIntervals.get(gameId));
    }

    const interval = setInterval(() => {
      if (gameRoom.isGameActive && gameRoom.calledNumbers.length < 75) {
        callNextNumber(gameId);
      } else {
        clearInterval(interval);
        activeIntervals.delete(gameId);
      }
    }, 3000);

    activeIntervals.set(gameId, interval);
  }

  function callNextNumber(gameId) {
    const gameRoom = gameRooms.get(gameId);
    if (!gameRoom || !gameRoom.isGameActive) return;

    let number;
    do {
      number = Math.floor(Math.random() * 75) + 1;
    } while (gameRoom.calledNumbers.includes(number));

    gameRoom.calledNumbers.push(number);
    
    io.to(gameId).emit('number-called', {
      number,
      totalCalled: gameRoom.calledNumbers.length,
      calledNumbers: gameRoom.calledNumbers
    });

    console.log(`Game ${gameId}: Called number ${number}`);
  }

  function checkAllPlayersReady(gameRoom) {
    const allPlayersReady = Array.from(gameRoom.players.values())
      .every(player => player.hasSelectedCard);
    
    if (allPlayersReady) {
      io.to(gameRoom.id).emit('all-players-ready');
    }
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`
🎯 Multiplayer Bingo Backend Server
📍 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
🚀 Features: Card Selection + Manual Bingo Claim
✅ Ready to accept connections!
  `);
});
