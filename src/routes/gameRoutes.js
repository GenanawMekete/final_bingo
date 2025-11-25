const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// In-memory storage for games
const games = new Map();

// Create a new quick game
router.post('/quick', (req, res) => {
  try {
    const gameId = `quick_${Date.now()}_${uuidv4().slice(0, 8)}`;
    
    const game = {
      id: gameId,
      type: 'quick',
      status: 'waiting',
      betAmount: parseInt(process.env.DEFAULT_BET_AMOUNT) || 10,
      maxPlayers: parseInt(process.env.MAX_PLAYERS_PER_GAME) || 1000,
      players: [],
      calledNumbers: [],
      currentNumber: null,
      scheduledStart: new Date(Date.now() + 5000), // Start in 5 seconds
      createdAt: new Date()
    };

    games.set(gameId, game);

    // Schedule game start
    setTimeout(() => {
      startGame(gameId);
    }, 30000); // Start in 30 seconds

    res.status(201).json({
      success: true,
      data: game
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Get all active games
router.get('/active', (req, res) => {
  try {
    const activeGames = Array.from(games.values()).filter(
      game => game.status === 'waiting' || game.status === 'playing'
    );
    
    res.json({
      success: true,
      data: activeGames
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get specific game
router.get('/:gameId', (req, res) => {
  try {
    const game = games.get(req.params.gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      });
    }

    res.json({
      success: true,
      data: game
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start a game
function startGame(gameId) {
  const game = games.get(gameId);
  if (!game || game.status !== 'waiting') return;

  game.status = 'playing';
  game.startedAt = new Date();

  // Start calling numbers
  startNumberCalling(gameId);
}

// Call numbers for a game
function startNumberCalling(gameId) {
  const game = games.get(gameId);
  if (!game) return;

  const callInterval = setInterval(() => {
    if (game.status !== 'playing') {
      clearInterval(callInterval);
      return;
    }

    const newNumber = callRandomNumber(game.calledNumbers);
    if (newNumber) {
      game.calledNumbers.push(newNumber.value);
      game.currentNumber = newNumber.value;

      // Emit to all players in the game
      const io = require('../config/socket').getIO();
      io.to(gameId).emit('number-called', {
        number: newNumber,
        calledCount: game.calledNumbers.length,
        currentNumber: game.currentNumber
      });

      if (game.calledNumbers.length >= 75) {
        endGame(gameId, 'All numbers called');
        clearInterval(callInterval);
      }
    }
  }, parseInt(process.env.NUMBER_CALL_INTERVAL) || 2000);
}

// Call a random number
function callRandomNumber(calledNumbers) {
  if (calledNumbers.length >= 75) return null;

  let number;
  do {
    number = Math.floor(Math.random() * 75) + 1;
  } while (calledNumbers.includes(number));

  const letters = ['B', 'I', 'N', 'G', 'O'];
  const letterIndex = Math.floor((number - 1) / 15);

  return {
    value: number,
    letter: letters[letterIndex],
    display: `${letters[letterIndex]}-${number}`
  };
}

// End a game
function endGame(gameId, reason) {
  const game = games.get(gameId);
  if (!game) return;

  game.status = 'ended';
  game.endedAt = new Date();
  game.endReason = reason;

  // Clean up after 1 minute
  setTimeout(() => {
    games.delete(gameId);
  }, 60000);
}

module.exports = router;
    const newNumber = callRandomNumber(game.calledNumbers);
    if (newNumber) {
      game.calledNumbers.push(newNumber.value);
      game.currentNumber = newNumber.value;

      // Emit to all players in the game
      const io = require('../config/socket').getIO();
      io.to(gameId).emit('number-called', {
        number: newNumber,
        calledCount: game.calledNumbers.length,
        currentNumber: game.currentNumber
      });

      if (game.calledNumbers.length >= 75) {
        endGame(gameId, 'All numbers called');
        clearInterval(callInterval);
      }
    }
  }, parseInt(process.env.NUMBER_CALL_INTERVAL) || 2000);
}

// Call a random number
function callRandomNumber(calledNumbers) {
  if (calledNumbers.length >= 75) return null;

  let number;
  do {
    number = Math.floor(Math.random() * 75) + 1;
  } while (calledNumbers.includes(number));

  const letters = ['B', 'I', 'N', 'G', 'O'];
  const letterIndex = Math.floor((number - 1) / 15);

  return {
    value: number,
    letter: letters[letterIndex],
    display: `${letters[letterIndex]}-${number}`
  };
}

// End a game
function endGame(gameId, reason) {
  const game = games.get(gameId);
  if (!game) return;

  game.status = 'ended';
  game.endedAt = new Date();
  game.endReason = reason;

  // Clean up after 1 minute
  setTimeout(() => {
    games.delete(gameId);
  }, 60000);
}

module.exports = router;
