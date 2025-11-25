const BingoCard = require('../models/BingoCard');
const Game = require('../models/Game');
const gameService = require('../services/gameService');
const bingoService = require('../services/bingoService');
const cardService = require('../services/cardService');
const { SOCKET_EVENTS, GAME_CONSTANTS } = require('../config/constants');
const logger = require('../utils/logger');

module.exports = {
  // Claim bingo
  claimBingo: (socket, io) => async (data, callback) => {
    try {
      const { gameId, pattern, winningNumbers } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      if (!pattern || !winningNumbers || !Array.isArray(winningNumbers)) {
        throw new Error('Invalid bingo claim data');
      }

      // Process bingo claim
      const result = await gameService.processBingoClaim(
        gameId, 
        playerId, 
        pattern, 
        winningNumbers
      );

      // Notify all players in the game
      io.to(`game:${gameId}`).emit(SOCKET_EVENTS.BINGO_VALID, {
        gameId,
        winner: {
          id: result.winner._id,
          username: result.winner.telegramUsername,
          firstName: result.winner.firstName
        },
        pattern: result.pattern,
        prize: result.prize,
        winningNumbers,
        timestamp: new Date()
      });

      if (callback) {
        callback({
          success: true,
          ...result
        });
      }

      logger.info(`Bingo claimed successfully by player ${playerId} in game ${gameId}`);

    } catch (error) {
      logger.error('Error in claimBingo event:', error);
      
      // Notify player about invalid claim
      socket.emit(SOCKET_EVENTS.BINGO_INVALID, {
        error: error.message,
        gameId: data.gameId
      });

      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Mark number on card
  markNumber: (socket, io) => async (data, callback) => {
    try {
      const { gameId, number, position } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      // Get player's card for this game
      const game = await Game.findById(gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      const playerEntry = game.players.find(
        p => p.player.toString() === playerId.toString()
      );

      if (!playerEntry) {
        throw new Error('Player not in game');
      }

      // Mark the number
      const result = await cardService.markNumber(
        playerEntry.bingoCard, 
        number, 
        position
      );

      // Check if this marking resulted in a bingo
      if (result.bingo) {
        // Auto-claim bingo
        const winningPattern = result.winningPattern;
        const winningNumbers = this.getWinningNumbersFromPattern(
          result.card, 
          winningPattern
        );

        // Process the bingo claim
        const bingoResult = await gameService.processBingoClaim(
          gameId,
          playerId,
          winningPattern.name,
          winningNumbers
        );

        // Notify all players
        io.to(`game:${gameId}`).emit(SOCKET_EVENTS.BINGO_VALID, {
          gameId,
          winner: {
            id: playerId,
            username: bingoResult.winner.telegramUsername,
            firstName: bingoResult.winner.firstName
          },
          pattern: winningPattern.name,
          prize: bingoResult.prize,
          winningNumbers,
          timestamp: new Date(),
          autoClaimed: true
        });
      }

      if (callback) {
        callback({
          success: true,
          marked: true,
          number,
          bingo: result.bingo,
          winningPattern: result.winningPattern
        });
      }

      logger.info(`Player ${playerId} marked number ${number} in game ${gameId}`);

    } catch (error) {
      logger.error('Error in markNumber event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Get card state
  getCardState: (socket, io) => async (data, callback) => {
    try {
      const { gameId } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      const game = await Game.findById(gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      const playerEntry = game.players.find(
        p => p.player.toString() === playerId.toString()
      );

      if (!playerEntry) {
        throw new Error('Player not in game');
      }

      const card = await cardService.getCard(playerEntry.bingoCard);
      const cardDisplay = card.getCardDisplay();

      // Get called numbers for analysis
      const calledNumbers = game.calledNumbers.map(cn => cn.number);

      // Analyze card potential
      const analysis = await bingoService.analyzeCardPotential(
        playerEntry.bingoCard,
        calledNumbers
      );

      if (callback) {
        callback({
          success: true,
          card: cardDisplay,
          markedNumbers: card.markedNumbers,
          hasBingo: card.hasBingo,
          analysis,
          calledNumbers
        });
      }

    } catch (error) {
      logger.error('Error in getCardState event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Auto-mark numbers based on called numbers
  autoMarkNumbers: (socket, io) => async (data, callback) => {
    try {
      const { gameId } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      const game = await Game.findById(gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      const playerEntry = game.players.find(
        p => p.player.toString() === playerId.toString()
      );

      if (!playerEntry) {
        throw new Error('Player not in game');
      }

      const calledNumbers = game.calledNumbers.map(cn => cn.number);
      const result = await cardService.autoMarkNumbers(
        playerEntry.bingoCard,
        calledNumbers
      );

      // Check for bingo after auto-marking
      if (result.hasBingo) {
        const winningPattern = result.winningPattern;
        const winningNumbers = this.getWinningNumbersFromPattern(
          result.card,
          winningPattern
        );

        // Auto-claim bingo
        const bingoResult = await gameService.processBingoClaim(
          gameId,
          playerId,
          winningPattern.name,
          winningNumbers
        );

        io.to(`game:${gameId}`).emit(SOCKET_EVENTS.BINGO_VALID, {
          gameId,
          winner: {
            id: playerId,
            username: bingoResult.winner.telegramUsername,
            firstName: bingoResult.winner.firstName
          },
          pattern: winningPattern.name,
          prize: bingoResult.prize,
          winningNumbers,
          timestamp: new Date(),
          autoClaimed: true,
          autoMarked: true
        });
      }

      if (callback) {
        callback({
          success: true,
          markedCount: result.markedCount,
          newlyMarked: result.newlyMarked,
          hasBingo: result.hasBingo,
          winningPattern: result.winningPattern
        });
      }

      logger.info(`Auto-marked ${result.markedCount} numbers for player ${playerId} in game ${gameId}`);

    } catch (error) {
      logger.error('Error in autoMarkNumbers event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Get winning numbers from pattern (helper function)
  getWinningNumbersFromPattern: (card, pattern) => {
    const winningNumbers = [];
    
    if (pattern.positions) {
      for (const position of pattern.positions) {
        const number = card.getNumberAt(position.row, position.col);
        if (number !== null) { // Skip free space
          winningNumbers.push(number);
        }
      }
    }
    
    return winningNumbers;
  },

  // Handle invalid bingo claim (internal use)
  handleInvalidBingo: async (gameId, playerId, reason, io) => {
    try {
      io.to(`game:${gameId}`).emit(SOCKET_EVENTS.BINGO_INVALID, {
        gameId,
        playerId,
        reason,
        timestamp: new Date()
      });

      // Also notify the specific player
      io.to(`user:${playerId}`).emit('bingo_claim_failed', {
        gameId,
        reason,
        timestamp: new Date()
      });

      logger.info(`Invalid bingo claim from player ${playerId} in game ${gameId}: ${reason}`);

    } catch (error) {
      logger.error('Error in handleInvalidBingo:', error);
    }
  }
};
