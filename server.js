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
const cardPools = new Map(); // Store card pools for each game

// Generate a pool of bingo cards for a game
function generateCardPool(gameId, poolSize = 20) {
  const pool = [];
  for (let i = 0; i < poolSize; i++) {
    pool.push(generateBingoCard());
  }
  cardPools.set(gameId, pool);
  return pool;
}

function generateBingoCard() {
  const ranges = [
    { min: 1, max: 15 }, { min: 16, max: 30 }, { min: 31, max: 45 },
    { min: 46, max: 60 }, { min: 61, max: 75 }
  ];

  const card = [];
  for (let col = 0; col < 5; col++) {
    const numbers = generateColumnNumbers(ranges[col].min, ranges[col].max);
    for (let row = 0; row < 5; row++) {
      if (row === 2 && col === 2) {
        card.push({ number: 'FREE', isFree: true, row, col, index: row * 5 + col });
      } else {
        card.push({ 
          number: numbers[row], 
          isFree: false, 
          row, 
          col, 
          index: row * 5 + col 
        });
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
  return numbers;
}

function checkWinCondition(markedCells) {
  // Condition 1: Any row OR any column
  let hasCompleteRow = false;
  let hasCompleteColumn = false;

  // Check rows
  for (let row = 0; row < 5; row++) {
    let rowComplete = true;
    for (let col = 0; col < 5; col++) {
      const index = row * 5 + col;
      if (index !== 12 && !markedCells.has(index)) {
        rowComplete = false;
        break;
      }
    }
    if (rowComplete) hasCompleteRow = true;
  }

  // Check columns
  for (let col = 0; col < 5; col++) {
    let colComplete = true;
    for (let row = 0; row < 5; row++) {
      const index = row * 5 + col;
      if (index !== 12 && !markedCells.has(index)) {
        colComplete = false;
        break;
      }
    }
    if (colComplete) hasCompleteColumn = true;
  }

  const condition1 = hasCompleteRow || hasCompleteColumn;

  // Condition 2: Both diagonals
  let mainDiagonalComplete = true;
  let antiDiagonalComplete = true;
  
  for (let i = 0; i < 5; i++) {
    const mainIndex = i * 5 + i;
    const antiIndex = i * 5 + (4 - i);
    if (mainIndex !== 12 && !markedCells.has(mainIndex)) mainDiagonalComplete = false;
    if (antiIndex !== 12 && !markedCells.has(antiIndex)) antiDiagonalComplete = false;
  }
  
  const condition2 = mainDiagonalComplete && antiDiagonalComplete;

  // Condition 3: Four corners
  const corners = [0, 4, 20, 24];
  const condition3 = corners.every(index => markedCells.has(index));

  return condition1 || condition2 || condition3;
}

function getWinningPattern(markedCells) {
  const patterns = [];

  // Check rows
  for (let row = 0; row < 5; row++) {
    let rowComplete = true;
    const rowCells = [];
    for (let col = 0; col < 5; col++) {
      const index = row * 5 + col;
      rowCells.push(index);
      if (index !== 12 && !markedCells.has(index)) rowComplete = false;
    }
    if (rowComplete) patterns.push({ type: 'row', cells: rowCells, index: row });
  }

  // Check columns
  for (let col = 0; col < 5; col++) {
    let colComplete = true;
    const colCells = [];
    for (let row = 0; row < 5; row++) {
      const index = row * 5 + col;
      colCells.push(index);
      if (index !== 12 && !markedCells.has(index)) colComplete = false;
    }
    if (colComplete) patterns.push({ type: 'column', cells: colCells, index: col });
  }

  // Check diagonals
  const mainDiagonal = [0, 6, 12, 18, 24];
  const antiDiagonal = [4, 8, 12, 16, 20];
  
  const mainComplete = mainDiagonal.every(index => index === 12 || markedCells.has(index));
  const antiComplete = antiDiagonal.every(index => index === 12 || markedCells.has(index));
  
  if (mainComplete) patterns.push({ type: 'diagonal', cells: mainDiagonal, which: 'main' });
  if (antiComplete) patterns.push({ type: 'diagonal', cells: antiDiagonal, which: 'anti' });

  // Check four corners
  const corners = [0, 4, 20, 24];
  if (corners.every(index => markedCells.has(index))) {
    patterns.push({ type: 'corners', cells: corners });
  }

  return patterns;
}

// API Routes
app.get('/', (req, res) => {
  res.json({ message: 'Bingo Backend API', status: 'running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/stats', (req, res) => {
  res.json({
    activeGames: gameRooms.size,
    totalPlayers: Array.from(gameRooms.values()).reduce((sum, room) => sum + room.players.size, 0),
    uptime: process.uptime()
  });
});

// Socket.io
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

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
      bingoClaims: new Map(), // Track bingo claims
      cardPool: generateCardPool(gameId, 20) // Generate 20 cards for the pool
    };

    gameRooms.set(gameId, gameRoom);
    joinGame(socket, gameId, playerId, playerName);
    socket.emit('game-created', { gameId });
  });

  socket.on('join-game', (data) => {
    const { gameId, playerId, playerName } = data;
    joinGame(socket, gameId, playerId, playerName);
  });

  function joinGame(socket, gameId, playerId, playerName) {
    const gameRoom = gameRooms.get(gameId);
    if (!gameRoom) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Player joins without a card initially - they'll select one
    const player = {
      id: playerId,
      name: playerName,
      socketId: socket.id,
      card: null, // No card assigned yet
      markedCells: new Set([12]), // FREE space is always marked
      isHost: playerId === gameRoom.host,
      hasSelectedCard: false,
      hasClaimedBingo: false
    };

    gameRoom.players.set(playerId, player);
    playerConnections.set(socket.id, { gameId, playerId });
    socket.join(gameId);

    // Send available cards to the player
    socket.emit('card-pool', {
      cards: gameRoom.cardPool.map((card, index) => ({
        id: index,
        preview: getCardPreview(card)
      }))
    });

    socket.emit('game-joined', {
      game: {
        id: gameRoom.id,
        host: gameRoom.host,
        isGameActive: gameRoom.isGameActive,
        calledNumbers: gameRoom.calledNumbers,
        players: Array.from(gameRoom.players.values()).map(p => ({
          id: p.id, name: p.name, isHost: p.isHost, hasSelectedCard: p.hasSelectedCard
        }))
      },
      player: { id: player.id, name: player.name, isHost: player.isHost }
    });

    socket.to(gameId).emit('player-joined', {
      player: { id: player.id, name: player.name, isHost: player.isHost, hasSelectedCard: false },
      players: Array.from(gameRoom.players.values()).map(p => ({
        id: p.id, name: p.name, isHost: p.isHost, hasSelectedCard: p.hasSelectedCard
      }))
    });
  }

  // Player selects a card from the pool
  socket.on('select-card', (data) => {
    const { gameId, cardId } = data;
    const connection = playerConnections.get(socket.id);
    const gameRoom = gameRooms.get(gameId);
    const player = gameRoom?.players.get(connection.playerId);

    if (player && gameRoom && !player.hasSelectedCard) {
      if (cardId >= 0 && cardId < gameRoom.cardPool.length) {
        player.card = gameRoom.cardPool[cardId];
        player.hasSelectedCard = true;

        socket.emit('card-selected', {
          card: player.card,
          success: true
        });

        socket.to(gameId).emit('player-card-selected', {
          playerId: player.id,
          playerName: player.name
        });

        // Check if all players have selected cards and game can start
        checkAllPlayersReady(gameRoom);
      } else {
        socket.emit('error', { message: 'Invalid card selection' });
      }
    }
  });

  // Player claims Bingo
  socket.on('claim-bingo', (data) => {
    const { gameId } = data;
    const connection = playerConnections.get(socket.id);
    const gameRoom = gameRooms.get(gameId);
    const player = gameRoom?.players.get(connection.playerId);

    if (!player || !gameRoom?.isGameActive) {
      socket.emit('error', { message: 'Cannot claim Bingo now' });
      return;
    }

    if (player.hasClaimedBingo) {
      socket.emit('error', { message: 'You have already claimed Bingo' });
      return;
    }

    // Validate the claim
    if (checkWinCondition(player.markedCells)) {
      player.hasClaimedBingo = true;
      gameRoom.bingoClaims.set(player.id, {
        playerId: player.id,
        playerName: player.name,
        timestamp: Date.now(),
        markedCells: Array.from(player.markedCells),
        winningPattern: getWinningPattern(player.markedCells)
      });

      // Notify all players about the Bingo claim
      io.to(gameId).emit('bingo-claimed', {
        playerId: player.id,
        playerName: player.name,
        timestamp: Date.now()
      });

      console.log(`Player ${player.name} claimed Bingo in game ${gameId}`);
    } else {
      socket.emit('error', { message: 'No valid Bingo pattern found!' });
    }
  });

  // Host verifies Bingo claim
  socket.on('verify-bingo', (data) => {
    const { gameId, playerId, isValid } = data;
    const connection = playerConnections.get(socket.id);
    const gameRoom = gameRooms.get(gameId);

    if (!gameRoom || gameRoom.host !== connection.playerId) {
      socket.emit('error', { message: 'Only host can verify Bingo' });
      return;
    }

    const claim = gameRoom.bingoClaims.get(playerId);
    if (!claim) {
      socket.emit('error', { message: 'No Bingo claim found for this player' });
      return;
    }

    if (isValid) {
      // Player wins!
      gameRoom.isGameActive = false;
      gameRoom.winner = playerId;
      gameRoom.finishedAt = Date.now();

      io.to(gameId).emit('bingo-verified', {
        winner: {
          id: claim.playerId,
          name: claim.playerName,
          markedCells: claim.markedCells,
          winningPattern: claim.winningPattern
        },
        isValid: true,
        message: `${claim.playerName} wins with a valid Bingo!`
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

  socket.on('start-game', (data) => {
    const { gameId } = data;
    const connection = playerConnections.get(socket.id);
    const gameRoom = gameRooms.get(gameId);
    
    if (gameRoom && gameRoom.host === connection.playerId) {
      gameRoom.isGameActive = true;
      startNumberCalling(gameId);
      io.to(gameId).emit('game-started', { startedAt: Date.now() });
    }
  });

  socket.on('mark-cell', (data) => {
    const { gameId, cellIndex } = data;
    const connection = playerConnections.get(socket.id);
    const gameRoom = gameRooms.get(gameId);
    const player = gameRoom?.players.get(connection.playerId);

    if (player && gameRoom?.isGameActive && player.hasSelectedCard) {
      const cell = player.card.find(c => c.index === cellIndex);
      if (cell && !cell.isFree && gameRoom.calledNumbers.includes(cell.number)) {
        player.markedCells.add(cellIndex);
        
        socket.emit('cell-marked', { cellIndex });
        socket.to(gameId).emit('player-marked-cell', {
          playerId: player.id, markedCount: player.markedCells.size
        });
      }
    }
  });

  socket.on('send-chat', (data) => {
    const { gameId, message } = data;
    const connection = playerConnections.get(socket.id);
    const gameRoom = gameRooms.get(gameId);
    const player = gameRoom?.players.get(connection.playerId);

    if (player) {
      io.to(gameId).emit('chat-message', {
        playerId: player.id, playerName: player.name, message, timestamp: Date.now()
      });
    }
  });

  socket.on('disconnect', () => {
    const connection = playerConnections.get(socket.id);
    if (connection) {
      const { gameId, playerId } = connection;
      const gameRoom = gameRooms.get(gameId);
      
      if (gameRoom) {
        gameRoom.players.delete(playerId);
        socket.to(gameId).emit('player-left', { playerId });
        
        if (gameRoom.players.size === 0) {
          gameRooms.delete(gameId);
          cardPools.delete(gameId);
        }
      }
      playerConnections.delete(socket.id);
    }
  });

  function startNumberCalling(gameId) {
    const gameRoom = gameRooms.get(gameId);
    if (!gameRoom) return;

    const interval = setInterval(() => {
      if (gameRoom.isGameActive && gameRoom.calledNumbers.length < 75) {
        let number;
        do {
          number = Math.floor(Math.random() * 75) + 1;
        } while (gameRoom.calledNumbers.includes(number));

        gameRoom.calledNumbers.push(number);
        io.to(gameId).emit('number-called', {
          number, totalCalled: gameRoom.calledNumbers.length
        });
      } else {
        clearInterval(interval);
      }
    }, 3000);
  }

  function getCardPreview(card) {
    // Create a preview showing first few numbers from each column
    const preview = {
      B: card.filter(c => c.col === 0 && !c.isFree).slice(0, 2).map(c => c.number),
      I: card.filter(c => c.col === 1 && !c.isFree).slice(0, 2).map(c => c.number),
      N: card.filter(c => c.col === 2 && !c.isFree).slice(0, 2).map(c => c.number),
      G: card.filter(c => c.col === 3 && !c.isFree).slice(0, 2).map(c => c.number),
      O: card.filter(c => c.col === 4 && !c.isFree).slice(0, 2).map(c => c.number)
    };
    return preview;
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
  console.log(`Bingo backend running on port ${PORT}`);
});
