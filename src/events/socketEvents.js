const logger = require('../utils/logger');
const { SOCKET_EVENTS, ERROR_MESSAGES } = require('../config/constants');

module.exports = (socket, io) => {
  logger.info(`Socket connected: ${socket.id} - User: ${socket.userId}`);

  // Handle connection errors
  socket.on('error', (error) => {
    logger.error(`Socket error for ${socket.id}:`, error);
    socket.emit('error', {
      type: 'connection_error',
      message: 'Connection error occurred'
    });
  });

  // Handle connection timeout
  socket.on('disconnect', (reason) => {
    logger.info(`Socket disconnected: ${socket.id} - Reason: ${reason}`);
    handleDisconnection(socket);
  });

  // Handle reconnection
  socket.on('reconnect', (attemptNumber) => {
    logger.info(`Socket reconnected: ${socket.id} - Attempt: ${attemptNumber}`);
    handleReconnection(socket);
  });

  // Ping-pong for connection health
  socket.on('ping', (data) => {
    socket.emit('pong', {
      timestamp: Date.now(),
      ...data
    });
  });

  // Get connection status
  socket.on('get_connection_status', () => {
    socket.emit('connection_status', {
      connected: true,
      socketId: socket.id,
      userId: socket.userId,
      timestamp: Date.now()
    });
  });

  // Error handling wrapper
  const withErrorHandling = (handler) => {
    return async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        logger.error(`Socket event error for ${socket.id}:`, error);
        
        const lastArg = args[args.length - 1];
        if (typeof lastArg === 'function') {
          // If there's a callback, send error
          lastArg({
            success: false,
            error: error.message
          });
        } else {
          // Otherwise emit error event
          socket.emit('error', {
            type: 'event_error',
            message: error.message,
            event: args[0] // event name
          });
        }
      }
    };
  };

  // Register all event handlers with error handling
  const gameEvents = require('./gameEvents');
  const playerEvents = require('./playerEvents');
  const roomEvents = require('./roomEvents');
  const bingoEvents = require('./bingoEvents');

  // Game events
  socket.on(SOCKET_EVENTS.JOIN_GAME, withErrorHandling(gameEvents.joinGame(socket, io)));
  socket.on(SOCKET_EVENTS.LEAVE_GAME, withErrorHandling(gameEvents.leaveGame(socket, io)));
  socket.on('get_game_state', withErrorHandling(gameEvents.getGameState(socket, io)));
  socket.on('player_ready', withErrorHandling(gameEvents.playerReady(socket, io)));

  // Player events
  socket.on('update_player_status', withErrorHandling(playerEvents.updatePlayerStatus(socket, io)));
  socket.on('get_player_stats', withErrorHandling(playerEvents.getPlayerStats(socket, io)));
  socket.on('update_settings', withErrorHandling(playerEvents.updateSettings(socket, io)));

  // Room events
  socket.on('create_room', withErrorHandling(roomEvents.createRoom(socket, io)));
  socket.on('join_room', withErrorHandling(roomEvents.joinRoom(socket, io)));
  socket.on('leave_room', withErrorHandling(roomEvents.leaveRoom(socket, io)));
  socket.on('get_rooms', withErrorHandling(roomEvents.getRooms(socket, io)));

  // Bingo events
  socket.on(SOCKET_EVENTS.CLAIM_BINGO, withErrorHandling(bingoEvents.claimBingo(socket, io)));
  socket.on('mark_number', withErrorHandling(bingoEvents.markNumber(socket, io)));
  socket.on('get_card_state', withErrorHandling(bingoEvents.getCardState(socket, io)));
};

// Handle disconnection
const handleDisconnection = async (socket) => {
  try {
    const { Player, Game, Room } = require('../models');
    
    // Update player online status
    if (socket.userId) {
      await Player.findByIdAndUpdate(socket.userId, {
        isOnline: false,
        lastActive: new Date()
      });

      // Leave current game if any
      const player = await Player.findById(socket.userId);
      if (player && player.currentGame) {
        const gameService = require('../services/gameService');
        await gameService.leaveGame(player.currentGame, socket.userId);
      }

      // Leave current room if any
      if (player && player.currentRoom) {
        const roomService = require('../services/roomService');
        await roomService.leaveRoom(player.currentRoom, socket.userId);
      }
    }
  } catch (error) {
    logger.error('Error handling disconnection:', error);
  }
};

// Handle reconnection
const handleReconnection = async (socket) => {
  try {
    if (socket.userId) {
      const playerService = require('../services/playerService');
      await playerService.updateOnlineStatus(socket.userId, true);

      // Notify about reconnection
      socket.emit('reconnected', {
        message: 'Successfully reconnected',
        timestamp: Date.now()
      });
    }
  } catch (error) {
    logger.error('Error handling reconnection:', error);
  }
};
