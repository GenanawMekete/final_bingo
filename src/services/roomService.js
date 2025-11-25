const Room = require('../models/Room');
const Player = require('../models/Player');
const Game = require('../models/Game');
const { ERROR_MESSAGES } = require('../config/constants');
const gameService = require('./gameService');
const logger = require('../utils/logger');

class RoomService {
  // Create a new room
  async createRoom(data) {
    try {
      const { name, description, config, creatorId } = data;

      let room;
      if (config.type === 'private') {
        room = await Room.createPrivateRoom(name, config.password, creatorId);
      } else {
        room = Room.createPublicRoom(name, description);
        await room.addPlayer(creatorId, true);
      }

      // Apply additional configuration
      if (config) {
        room.config = { ...room.config, ...config };
        await room.save();
      }

      logger.info(`Room created: ${room.roomId} by player ${creatorId}`);

      return room;
    } catch (error) {
      logger.error('Error creating room:', error);
      throw error;
    }
  }

  // Get room by ID
  async getRoom(roomId) {
    try {
      const room = await Room.findById(roomId)
        .populate('players.player', 'telegramUsername firstName lastName level')
        .populate('currentGame')
        .populate('bannedPlayers', 'telegramUsername firstName');

      if (!room) {
        throw new Error('Room not found');
      }

      return room;
    } catch (error) {
      logger.error('Error getting room:', error);
      throw error;
    }
  }

  // Get public rooms
  async getPublicRooms(limit = 20, page = 1) {
    try {
      const skip = (page - 1) * limit;

      const rooms = await Room.find({
        'config.type': 'public',
        status: 'waiting'
      })
        .populate('players.player', 'telegramUsername firstName lastName level')
        .sort({ 'stats.activePlayers': -1, createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const totalRooms = await Room.countDocuments({
        'config.type': 'public',
        status: 'waiting'
      });

      return {
        rooms,
        totalRooms,
        currentPage: page,
        totalPages: Math.ceil(totalRooms / limit),
        hasMore: page < Math.ceil(totalRooms / limit)
      };
    } catch (error) {
      logger.error('Error getting public rooms:', error);
      throw error;
    }
  }

  // Join a room
  async joinRoom(roomId, playerId, password = null) {
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // Check if room is accepting players
      if (room.status !== 'waiting') {
        throw new Error('Room is not accepting players');
      }

      // Check password for private rooms
      if (room.config.type === 'private' && room.password !== password) {
        throw new Error('Invalid password');
      }

      // Check if player is banned
      if (room.bannedPlayers.some(bp => bp.toString() === playerId.toString())) {
        throw new Error('You are banned from this room');
      }

      await room.addPlayer(playerId);

      // Update player's current room
      await Player.findByIdAndUpdate(playerId, { currentRoom: roomId });

      // Check if we can start the game (auto-start when full)
      if (room.canStart && room.config.autoStart) {
        setTimeout(async () => {
          try {
            await this.startGameInRoom(roomId);
          } catch (error) {
            logger.error('Error auto-starting game:', error);
          }
        }, 5000);
      }

      logger.info(`Player ${playerId} joined room: ${roomId}`);

      return room;
    } catch (error) {
      logger.error('Error joining room:', error);
      throw error;
    }
  }

  // Leave a room
  async leaveRoom(roomId, playerId) {
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      await room.removePlayer(playerId);

      // Update player's current room
      await Player.findByIdAndUpdate(playerId, { $unset: { currentRoom: 1 } });

      // If room becomes empty, close it
      if (room.players.length === 0) {
        await this.closeRoom(roomId);
      }

      logger.info(`Player ${playerId} left room: ${roomId}`);

      return room;
    } catch (error) {
      logger.error('Error leaving room:', error);
      throw error;
    }
  }

  // Start a game in the room
  async startGameInRoom(roomId) {
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      if (room.status !== 'waiting') {
        throw new Error('Room is not in waiting state');
      }

      if (!room.canStart) {
        throw new Error('Not enough players to start game');
      }

      // Create a new game for the room
      const game = await gameService.createGame(roomId, room.config);

      // Start the game
      await gameService.startGame(game._id);

      logger.info(`Game started in room: ${roomId}`);

      return game;
    } catch (error) {
      logger.error('Error starting game in room:', error);
      throw error;
    }
  }

  // Close a room
  async closeRoom(roomId) {
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // If there's an active game, end it first
      if (room.currentGame) {
        await gameService.endGame(room.currentGame, 'room_closed');
      }

      await room.closeRoom();

      // Remove all players from the room
      const playerIds = room.players.map(p => p.player);
      await Player.updateMany(
        { _id: { $in: playerIds } },
        { $unset: { currentRoom: 1 } }
      );

      logger.info(`Room closed: ${roomId}`);

      return room;
    } catch (error) {
      logger.error('Error closing room:', error);
      throw error;
    }
  }

  // Ban player from room
  async banPlayer(roomId, playerId, moderatorId) {
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // Check if moderator is host or has permission
      const moderator = room.players.find(p => 
        p.player.toString() === moderatorId.toString() && p.isHost
      );
      if (!moderator) {
        throw new Error('Only room host can ban players');
      }

      // Add to banned players
      if (!room.bannedPlayers.includes(playerId)) {
        room.bannedPlayers.push(playerId);
      }

      // Remove from current players if present
      await room.removePlayer(playerId);

      await room.save();

      // Update player's current room
      await Player.findByIdAndUpdate(playerId, { $unset: { currentRoom: 1 } });

      logger.info(`Player ${playerId} banned from room: ${roomId} by moderator ${moderatorId}`);

      return room;
    } catch (error) {
      logger.error('Error banning player:', error);
      throw error;
    }
  }

  // Transfer room ownership
  async transferOwnership(roomId, currentOwnerId, newOwnerId) {
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      const currentOwner = room.players.find(p => 
        p.player.toString() === currentOwnerId.toString() && p.isHost
      );
      if (!currentOwner) {
        throw new Error('Only room host can transfer ownership');
      }

      const newOwner = room.players.find(p => 
        p.player.toString() === newOwnerId.toString()
      );
      if (!newOwner) {
        throw new Error('New owner must be a player in the room');
      }

      // Transfer ownership
      currentOwner.isHost = false;
      newOwner.isHost = true;

      await room.save();

      logger.info(`Room ownership transferred in ${roomId} from ${currentOwnerId} to ${newOwnerId}`);

      return room;
    } catch (error) {
      logger.error('Error transferring room ownership:', error);
      throw error;
    }
  }

  // Get room statistics
  async getRoomStats(roomId) {
    try {
      const room = await Room.findById(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      const gameStats = await Game.aggregate([
        {
          $match: {
            room: room._id,
            status: 'finished'
          }
        },
        {
          $group: {
            _id: null,
            totalGames: { $sum: 1 },
            totalPlayers: { $sum: { $size: '$players' } },
            totalWinners: { $sum: { $size: '$winners' } },
            totalPrize: { $sum: { $sum: '$winners.prize' } },
            averageGameDuration: { $avg: '$stats.fastestBingo' }
          }
        }
      ]);

      return {
        room: room.stats,
        games: gameStats[0] || {
          totalGames: 0,
          totalPlayers: 0,
          totalWinners: 0,
          totalPrize: 0,
          averageGameDuration: 0
        }
      };
    } catch (error) {
      logger.error('Error getting room stats:', error);
      throw error;
    }
  }

  // Clean up inactive rooms
  async cleanupInactiveRooms() {
    const cutoffTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    
    const inactiveRooms = await Room.find({
      lastActivity: { $lt: cutoffTime },
      status: 'waiting',
      'players.0': { $exists: false } // No players
    });

    for (const room of inactiveRooms) {
      await this.closeRoom(room._id);
    }

    logger.info(`Cleaned up ${inactiveRooms.length} inactive rooms`);

    return inactiveRooms.length;
  }
}

module.exports = new RoomService();
