const Game = require('../models/Game');
const Room = require('../models/Room');
const Player = require('../models/Player');
const BingoCard = require('../models/BingoCard');
const { GAME_CONSTANTS, ERROR_MESSAGES } = require('../config/constants');
const cardService = require('./cardService');
const numberService = require('./numberService');
const timerService = require('./timerService');
const paymentService = require('./paymentService');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

class GameService {
  constructor() {
    this.activeGames = new Map();
    this.gameTimers = new Map();
  }

  // Create a new game in a room
  async createGame(roomId, config = {}) {
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        throw new Error(ERROR_MESSAGES.GAME.NOT_FOUND);
      }

      if (room.currentGame) {
        throw new Error('Room already has an active game');
      }

      // Generate unique game ID
      const gameId = `GAME_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const gameConfig = {
        duration: config.duration || GAME_CONSTANTS.TIMERS.GAME,
        maxPlayers: config.maxPlayers || room.config.maxPlayers,
        minPlayers: config.minPlayers || room.config.minPlayersToStart,
        entryFee: config.entryFee || room.config.entryFee,
        prizePool: config.prizePool || room.config.prizePool,
      };

      const game = new Game({
        gameId,
        room: roomId,
        config: gameConfig,
      });

      await game.save();

      // Update room with current game
      room.currentGame = game._id;
      room.status = 'starting';
      await room.save();

      // Store in active games
      this.activeGames.set(gameId, game);

      logger.info(`Game created: ${gameId} in room: ${roomId}`);

      return game;
    } catch (error) {
      logger.error('Error creating game:', error);
      throw error;
    }
  }

  // Start a game
  async startGame(gameId) {
    try {
      const game = await Game.findById(gameId);
      if (!game) {
        throw new Error(ERROR_MESSAGES.GAME.NOT_FOUND);
      }

      if (game.status !== GAME_CONSTANTS.STATUS.WAITING) {
        throw new Error(ERROR_MESSAGES.GAME.ALREADY_STARTED);
      }

      if (!game.canStart) {
        throw new Error(ERROR_MESSAGES.GAME.NOT_ENOUGH_PLAYERS);
      }

      // Generate bingo cards for all players
      for (const playerEntry of game.players) {
        const bingoCard = await cardService.generateCard(
          playerEntry.player,
          gameId
        );
        playerEntry.bingoCard = bingoCard._id;
      }

      await game.startGame();

      // Start game timer
      this.startGameTimer(gameId, game.config.duration);

      // Start number calling interval
      this.startNumberCalling(gameId);

      // Notify all players
      await notificationService.notifyGameStart(gameId);

      logger.info(`Game started: ${gameId}`);

      return game;
    } catch (error) {
      logger.error('Error starting game:', error);
      throw error;
    }
  }

  // Join a player to a game
  async joinGame(gameId, playerId) {
    try {
      const game = await Game.findById(gameId);
      if (!game) {
        throw new Error(ERROR_MESSAGES.GAME.NOT_FOUND);
      }

      if (game.isFull) {
        throw new Error(ERROR_MESSAGES.GAME.FULL);
      }

      if (game.status !== GAME_CONSTANTS.STATUS.WAITING) {
        throw new Error(ERROR_MESSAGES.GAME.ALREADY_STARTED);
      }

      // Check if player is already in game
      const existingPlayer = game.players.find(
        p => p.player.toString() === playerId.toString()
      );
      if (existingPlayer) {
        throw new Error(ERROR_MESSAGES.PLAYER.ALREADY_IN_GAME);
      }

      // Process entry fee if any
      if (game.config.entryFee > 0) {
        await paymentService.processEntryFee(playerId, game.config.entryFee, gameId);
        game.config.prizePool += game.config.entryFee;
      }

      // Add player to game
      await game.addPlayer(playerId);

      // Update player's current game
      await Player.findByIdAndUpdate(playerId, { 
        currentGame: gameId,
        currentRoom: game.room 
      });

      // Check if we can start the game (auto-start when full)
      if (game.isFull && game.config.autoStart) {
        setTimeout(() => this.startGame(gameId), 5000);
      }

      logger.info(`Player ${playerId} joined game: ${gameId}`);

      return game;
    } catch (error) {
      logger.error('Error joining game:', error);
      throw error;
    }
  }

  // Leave a game
  async leaveGame(gameId, playerId) {
    try {
      const game = await Game.findById(gameId);
      if (!game) {
        throw new Error(ERROR_MESSAGES.GAME.NOT_FOUND);
      }

      await game.removePlayer(playerId);

      // Update player's current game
      await Player.findByIdAndUpdate(playerId, { 
        $unset: { currentGame: 1, currentRoom: 1 } 
      });

      // If no players left, end the game
      if (game.players.length === 0) {
        await this.endGame(gameId, 'no_players');
      }

      logger.info(`Player ${playerId} left game: ${gameId}`);

      return game;
    } catch (error) {
      logger.error('Error leaving game:', error);
      throw error;
    }
  }

  // Call next number in game
  async callNextNumber(gameId) {
    try {
      const game = await Game.findById(gameId);
      if (!game) {
        throw new Error(ERROR_MESSAGES.GAME.NOT_FOUND);
      }

      if (game.status !== GAME_CONSTANTS.STATUS.IN_PROGRESS) {
        throw new Error('Game is not in progress');
      }

      // Check if all numbers have been called
      if (game.calledNumbers.length >= 75) {
        await this.endGame(gameId, 'all_numbers_called');
        return null;
      }

      const calledNumber = await game.callNumber();

      // Notify all players
      await notificationService.notifyNumberCalled(gameId, calledNumber);

      logger.info(`Number called in game ${gameId}: ${calledNumber.letter}${calledNumber.number}`);

      return calledNumber;
    } catch (error) {
      logger.error('Error calling number:', error);
      throw error;
    }
  }

  // Process bingo claim
  async processBingoClaim(gameId, playerId, pattern, winningNumbers) {
    try {
      const game = await Game.findById(gameId);
      if (!game) {
        throw new Error(ERROR_MESSAGES.GAME.NOT_FOUND);
      }

      const playerEntry = game.players.find(
        p => p.player.toString() === playerId.toString()
      );
      if (!playerEntry) {
        throw new Error(ERROR_MESSAGES.PLAYER.NOT_IN_GAME);
      }

      // Validate the bingo claim
      const isValid = await this.validateBingoClaim(
        playerEntry.bingoCard,
        pattern,
        winningNumbers,
        game.calledNumbers.map(cn => cn.number)
      );

      if (!isValid) {
        throw new Error(ERROR_MESSAGES.BINGO.INVALID_CLAIM);
      }

      // Process the bingo claim
      await game.claimBingo(playerId, pattern, winningNumbers);

      // Award prize to winner
      const winnerEntry = game.winners[game.winners.length - 1];
      await paymentService.awardPrize(playerId, winnerEntry.prize, gameId);

      // Update player stats
      const player = await Player.findById(playerId);
      await player.updateStats(true, 1);

      // End the game
      await this.endGame(gameId, 'bingo');

      // Notify all players
      await notificationService.notifyBingoWinner(gameId, playerId, winnerEntry.prize);

      logger.info(`Bingo claimed by player ${playerId} in game ${gameId}`);

      return {
        success: true,
        winner: player,
        prize: winnerEntry.prize,
        pattern: winnerEntry.pattern
      };
    } catch (error) {
      logger.error('Error processing bingo claim:', error);
      throw error;
    }
  }

  // Validate bingo claim
  async validateBingoClaim(cardId, pattern, winningNumbers, calledNumbers) {
    try {
      const card = await BingoCard.findById(cardId);
      if (!card) {
        throw new Error(ERROR_MESSAGES.GAME.INVALID_CARD);
      }

      // Check if all winning numbers are marked
      for (const number of winningNumbers) {
        if (!card.markedNumbers.some(mn => mn.number === number)) {
          return false;
        }
      }

      // Check if all winning numbers have been called
      for (const number of winningNumbers) {
        if (!calledNumbers.includes(number)) {
          return false;
        }
      }

      // Verify the pattern
      const validPattern = card.checkPattern(pattern);
      if (!validPattern) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error validating bingo claim:', error);
      return false;
    }
  }

  // End a game
  async endGame(gameId, reason = 'completed') {
    try {
      const game = await Game.findById(gameId);
      if (!game) {
        throw new Error(ERROR_MESSAGES.GAME.NOT_FOUND);
      }

      // Stop timers
      this.stopGameTimer(gameId);
      this.stopNumberCalling(gameId);

      await game.endGame(reason);

      // Update room
      const room = await Room.findById(game.room);
      if (room) {
        await room.completeGame();
      }

      // Update all players
      const playerIds = game.players.map(p => p.player);
      await Player.updateMany(
        { _id: { $in: playerIds } },
        { $unset: { currentGame: 1, currentRoom: 1 } }
      );

      // Remove from active games
      this.activeGames.delete(game.gameId);

      logger.info(`Game ended: ${gameId} - Reason: ${reason}`);

      return game;
    } catch (error) {
      logger.error('Error ending game:', error);
      throw error;
    }
  }

  // Start game timer
  startGameTimer(gameId, duration) {
    const timer = setTimeout(async () => {
      try {
        await this.endGame(gameId, 'time_up');
      } catch (error) {
        logger.error('Error in game timer:', error);
      }
    }, duration * 1000);

    this.gameTimers.set(gameId, timer);
  }

  // Stop game timer
  stopGameTimer(gameId) {
    const timer = this.gameTimers.get(gameId);
    if (timer) {
      clearTimeout(timer);
      this.gameTimers.delete(gameId);
    }
  }

  // Start number calling interval
  startNumberCalling(gameId) {
    const interval = setInterval(async () => {
      try {
        const game = await Game.findById(gameId);
        if (!game || game.status !== GAME_CONSTANTS.STATUS.IN_PROGRESS) {
          this.stopNumberCalling(gameId);
          return;
        }

        await this.callNextNumber(gameId);
      } catch (error) {
        logger.error('Error in number calling interval:', error);
      }
    }, GAME_CONSTANTS.TIMERS.NUMBER_CALL_INTERVAL * 1000);

    this.gameTimers.set(`number_${gameId}`, interval);
  }

  // Stop number calling
  stopNumberCalling(gameId) {
    const interval = this.gameTimers.get(`number_${gameId}`);
    if (interval) {
      clearInterval(interval);
      this.gameTimers.delete(`number_${gameId}`);
    }
  }

  // Get active games
  async getActiveGames() {
    return Game.find({
      status: { $in: [GAME_CONSTANTS.STATUS.WAITING, GAME_CONSTANTS.STATUS.IN_PROGRESS] }
    }).populate('players.player', 'telegramUsername firstName lastName');
  }

  // Get game by ID
  async getGame(gameId) {
    return Game.findById(gameId)
      .populate('players.player', 'telegramUsername firstName lastName')
      .populate('players.bingoCard')
      .populate('winners.player', 'telegramUsername firstName lastName');
  }

  // Get player's current game
  async getPlayerGame(playerId) {
    return Game.findOne({
      'players.player': playerId,
      status: { $in: [GAME_CONSTANTS.STATUS.WAITING, GAME_CONSTANTS.STATUS.IN_PROGRESS] }
    });
  }

  // Clean up abandoned games
  async cleanupAbandonedGames() {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    const abandonedGames = await Game.find({
      status: { $in: [GAME_CONSTANTS.STATUS.WAITING, GAME_CONSTANTS.STATUS.IN_PROGRESS] },
      updatedAt: { $lt: cutoffTime }
    });

    for (const game of abandonedGames) {
      await this.endGame(game._id, 'abandoned');
    }

    logger.info(`Cleaned up ${abandonedGames.length} abandoned games`);
  }
}

module.exports = new GameService();
