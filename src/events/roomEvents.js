const Room = require('../models/Room');
const roomService = require('../services/roomService');
const logger = require('../utils/logger');

module.exports = {
  // Create a new room
  createRoom: (socket, io) => async (data, callback) => {
    try {
      const { name, description, config = {} } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      if (!name) {
        throw new Error('Room name is required');
      }

      const room = await roomService.createRoom({
        name,
        description,
        config,
        creatorId: playerId
      });

      // Join socket room
      socket.join(`room:${room._id}`);
      socket.roomId = room._id;

      if (callback) {
        callback({
          success: true,
          room
        });
      }

      // Broadcast room creation
      io.emit('room_created', {
        room: {
          id: room._id,
          name: room.name,
          description: room.description,
          playerCount: room.playerCount,
          config: room.config
        }
      });

      logger.info(`Room created: ${room.roomId} by player ${playerId}`);

    } catch (error) {
      logger.error('Error in createRoom event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Join a room
  joinRoom: (socket, io) => async (data, callback) => {
    try {
      const { roomId, password } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      const room = await roomService.joinRoom(roomId, playerId, password);

      // Join socket room
      socket.join(`room:${roomId}`);
      socket.roomId = roomId;

      // Notify room members
      socket.to(`room:${roomId}`).emit('player_joined_room', {
        playerId,
        roomId,
        playerCount: room.playerCount
      });

      if (callback) {
        callback({
          success: true,
          room
        });
      }

      logger.info(`Player ${playerId} joined room: ${roomId}`);

    } catch (error) {
      logger.error('Error in joinRoom event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Leave a room
  leaveRoom: (socket, io) => async (data, callback) => {
    try {
      const { roomId } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      const room = await roomService.leaveRoom(roomId, playerId);

      // Leave socket room
      socket.leave(`room:${roomId}`);
      delete socket.roomId;

      // Notify room members
      socket.to(`room:${roomId}`).emit('player_left_room', {
        playerId,
        roomId,
        playerCount: room.playerCount
      });

      if (callback) {
        callback({
          success: true,
          message: 'Left room successfully'
        });
      }

      logger.info(`Player ${playerId} left room: ${roomId}`);

    } catch (error) {
      logger.error('Error in leaveRoom event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Get available rooms
  getRooms: (socket, io) => async (data, callback) => {
    try {
      const { limit = 20, page = 1, type = 'public' } = data;

      let rooms;
      
      if (type === 'public') {
        rooms = await roomService.getPublicRooms(limit, page);
      } else {
        // For private rooms, only show rooms the player has access to
        const playerId = socket.userId;
        if (!playerId) {
          throw new Error('Authentication required for private rooms');
        }

        rooms = await Room.find({
          'config.type': 'private',
          'players.player': playerId,
          status: 'waiting'
        })
        .populate('players.player', 'telegramUsername firstName lastName')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit);
      }

      if (callback) {
        callback({
          success: true,
          rooms
        });
      } else {
        socket.emit('rooms_list', rooms);
      }

    } catch (error) {
      logger.error('Error in getRooms event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Get room details
  getRoomDetails: (socket, io) => async (data, callback) => {
    try {
      const { roomId } = data;

      const room = await roomService.getRoom(roomId);

      if (callback) {
        callback({
          success: true,
          room
        });
      }

    } catch (error) {
      logger.error('Error in getRoomDetails event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Transfer room ownership
  transferOwnership: (socket, io) => async (data, callback) => {
    try {
      const { roomId, newOwnerId } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      const room = await roomService.transferOwnership(roomId, playerId, newOwnerId);

      // Notify room members
      io.to(`room:${roomId}`).emit('ownership_transferred', {
        roomId,
        previousOwner: playerId,
        newOwner: newOwnerId
      });

      if (callback) {
        callback({
          success: true,
          room
        });
      }

      logger.info(`Room ownership transferred in ${roomId} from ${playerId} to ${newOwnerId}`);

    } catch (error) {
      logger.error('Error in transferOwnership event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Handle room game start (internal use)
  handleRoomGameStart: async (roomId, gameId, io) => {
    try {
      io.to(`room:${roomId}`).emit('room_game_starting', {
        roomId,
        gameId,
        message: 'Game is starting in the room!'
      });

      logger.info(`Room game start notified for room ${roomId}, game ${gameId}`);

    } catch (error) {
      logger.error('Error in handleRoomGameStart:', error);
    }
  }
};
