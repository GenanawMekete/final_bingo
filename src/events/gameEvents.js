const Game = require('../models/Game');
const Player = require('../models/Player');
const gameService = require('../services/gameService');
const roomService = require('../services/roomService');
const notificationService = require('../services/notificationService');
const { SOCKET_EVENTS, GAME_CONSTANTS } = require('../config/constants');
const logger = require('../utils/logger');

module.exports = {
  // Join a game
  joinGame: (socket, io) => async (data, callback) => {
    try {
      const { gameId, roomId } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      let game;

      if (roomId) {
        // Join room first, then create/join game in that room
        const room = await roomService.joinRoom(roomId, playerId);
        if (room.currentGame) {
          game = await gameService.joinGame(room.currentGame, playerId);
        } else {
          // Create new game in the room
          const newGame = await gameService.createGame(roomId);
          game = await gameService.joinGame(newGame._id, playerId);
        }
      } else if (gameId) {
        // Join specific game directly
        game = await gameService.joinGame(gameId, playerId);
      } else {
        throw new Error('Either gameId or roomId is required');
      }

      // Join socket room for this game
      socket.join(`game:${game._id}`);
      socket.gameId = game._id;

      // Get updated game state
      const gameState = await gameService.getGame(game._id);

      // Notify the player who joined
      socket.emit(SOCKET_EVENTS.GAME_STATE, {
        type: 'joined',
        game: gameState,
        playerId
      });

      // Notify other players in the game
      socket.to(`game:${game._id}`).emit(SOCKET_EVENTS.PLAYER_JOINED, {
        playerId,
        playerCount: gameState.players.length,
        gameId: game._id
      });

      // Send success response
      if (callback) {
        callback({
          success: true,
          game: gameState
        });
      }

      logger.info(`Player ${playerId} joined game ${game._id}`);

    } catch (error) {
      logger.error('Error in joinGame event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      } else {
        socket.emit('error', {
          type: 'join_game_error',
          message: error.message
        });
      }
    }
  },

  // Leave a game
  leaveGame: (socket, io) => async (data, callback) => {
    try {
      const { gameId } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      const game = await gameService.leaveGame(gameId, playerId);

      // Leave socket room
      socket.leave(`game:${gameId}`);
      delete socket.gameId;

      // Notify other players
      socket.to(`game:${gameId}`).emit(SOCKET_EVENTS.PLAYER_LEFT, {
        playerId,
        playerCount: game.players.length,
        gameId
      });

      // Send success response
      if (callback) {
        callback({
          success: true,
          message: 'Left game successfully'
        });
      }

      logger.info(`Player ${playerId} left game ${gameId}`);

    } catch (error) {
      logger.error('Error in leaveGame event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Get current game state
  getGameState: (socket, io) => async (data, callback) => {
    try {
      const { gameId } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      const game = await gameService.getGame(gameId);
      
      if (!game) {
        throw new Error('Game not found');
      }

      // Check if player is in this game
      const isPlayerInGame = game.players.some(
        p => p.player._id.toString() === playerId.toString()
      );

      if (!isPlayerInGame) {
        throw new Error('Not a member of this game');
      }

      // Get player's card
      const playerEntry = game.players.find(
        p => p.player._id.toString() === playerId.toString()
      );

      const cardService = require('../services/cardService');
      const card = await cardService.getCard(playerEntry.bingoCard);

      const response = {
        game: {
          ...game.toJSON(),
          timeRemaining: game.timeRemaining,
          playerCount: game.playerCount
        },
        card: card.getCardDisplay(),
        calledNumbers: game.calledNumbers.map(cn => cn.number),
        currentNumber: game.currentNumber
      };

      if (callback) {
        callback({
          success: true,
          ...response
        });
      } else {
        socket.emit('game_state', response);
      }

    } catch (error) {
      logger.error('Error in getGameState event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Player ready status
  playerReady: (socket, io) => async (data, callback) => {
    try {
      const { gameId, isReady } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      const game = await Game.findById(gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      // Update player ready status
      const playerEntry = game.players.find(
        p => p.player.toString() === playerId.toString()
      );

      if (!playerEntry) {
        throw new Error('Player not in game');
      }

      playerEntry.isReady = isReady !== false;
      await game.save();

      // Notify other players
      socket.to(`game:${gameId}`).emit('player_ready_update', {
        playerId,
        isReady: playerEntry.isReady,
        gameId
      });

      // Check if all players are ready (for ready-up games)
      const allReady = game.players.every(p => p.isReady);
      if (allReady && game.players.length >= game.config.minPlayers) {
        // Start game after short delay
        setTimeout(async () => {
          try {
            await gameService.startGame(gameId);
          } catch (error) {
            logger.error('Error auto-starting game:', error);
          }
        }, 3000);
      }

      if (callback) {
        callback({
          success: true,
          isReady: playerEntry.isReady
        });
      }

      logger.info(`Player ${playerId} ready status: ${playerEntry.isReady} in game ${gameId}`);

    } catch (error) {
      logger.error('Error in playerReady event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Handle game start (internal use, called by service)
  handleGameStart: async (gameId, io) => {
    try {
      const game = await gameService.getGame(gameId);
      
      // Notify all players in the game
      io.to(`game:${gameId}`).emit(SOCKET_EVENTS.GAME_START, {
        game: {
          id: game._id,
          duration: game.config.duration,
          startTime: game.actualStartTime,
          players: game.players.map(p => ({
            id: p.player._id,
            username: p.player.telegramUsername
          }))
        },
        message: 'Game started!'
      });

      logger.info(`Game start notified for game ${gameId}`);

    } catch (error) {
      logger.error('Error in handleGameStart:', error);
    }
  },

  // Handle game end (internal use, called by service)
  handleGameEnd: async (gameId, reason, winners, io) => {
    try {
      const game = await gameService.getGame(gameId);

      // Notify all players in the game
      io.to(`game:${gameId}`).emit(SOCKET_EVENTS.GAME_END, {
        gameId,
        reason,
        winners: winners || game.winners,
        calledNumbers: game.calledNumbers.length,
        duration: game.timeElapsed,
        message: getGameEndMessage(reason)
      });

      // Clean up socket rooms
      const sockets = await io.in(`game:${gameId}`).fetchSockets();
      sockets.forEach(socket => {
        socket.leave(`game:${gameId}`);
        delete socket.gameId;
      });

      logger.info(`Game end notified for game ${gameId} - Reason: ${reason}`);

    } catch (error) {
      logger.error('Error in handleGameEnd:', error);
    }
  },

  // Handle number called (internal use, called by service)
  handleNumberCalled: async (gameId, calledNumber, io) => {
    try {
      io.to(`game:${gameId}`).emit(SOCKET_EVENTS.NUMBER_CALLED, {
        gameId,
        number: calledNumber.number,
        letter: calledNumber.letter,
        callOrder: calledNumber.callOrder,
        totalCalls: calledNumber.callOrder,
        timestamp: calledNumber.calledAt
      });

      logger.info(`Number called notified for game ${gameId}: ${calledNumber.letter}${calledNumber.number}`);

    } catch (error) {
      logger.error('Error in handleNumberCalled:', error);
    }
  }
};

// Helper function for game end messages
function getGameEndMessage(reason) {
  const messages = {
    'bingo': 'Bingo! Game completed with a winner!',
    'time_up': 'Time\'s up! Game completed.',
    'no_players': 'Game ended - no players remaining.',
    'all_numbers_called': 'All numbers have been called!',
    'abandoned': 'Game was abandoned.',
    'room_closed': 'Game ended - room closed.'
  };

  return messages[reason] || 'Game completed.';
             }
