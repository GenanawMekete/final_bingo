const Player = require('../models/Player');
const playerService = require('../services/playerService');
const logger = require('../utils/logger');

module.exports = {
  // Update player online status
  updatePlayerStatus: (socket, io) => async (data, callback) => {
    try {
      const { isOnline } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      const player = await playerService.updateOnlineStatus(playerId, isOnline);

      // Notify friends or players in same room/game
      if (socket.gameId) {
        socket.to(`game:${socket.gameId}`).emit('player_status_update', {
          playerId,
          isOnline,
          lastActive: player.lastActive
        });
      }

      if (callback) {
        callback({
          success: true,
          isOnline: player.isOnline,
          lastActive: player.lastActive
        });
      }

      logger.info(`Player ${playerId} status updated to: ${isOnline ? 'online' : 'offline'}`);

    } catch (error) {
      logger.error('Error in updatePlayerStatus event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Get player statistics
  getPlayerStats: (socket, io) => async (data, callback) => {
    try {
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      const stats = await playerService.getPlayerStats(playerId);

      if (callback) {
        callback({
          success: true,
          ...stats
        });
      } else {
        socket.emit('player_stats', stats);
      }

    } catch (error) {
      logger.error('Error in getPlayerStats event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Update player settings
  updateSettings: (socket, io) => async (data, callback) => {
    try {
      const { settings } = data;
      const playerId = socket.userId;

      if (!playerId) {
        throw new Error('Authentication required');
      }

      const player = await playerService.updatePlayerSettings(playerId, settings);

      if (callback) {
        callback({
          success: true,
          settings: player.settings
        });
      }

      logger.info(`Player ${playerId} updated settings`);

    } catch (error) {
      logger.error('Error in updateSettings event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Get leaderboard
  getLeaderboard: (socket, io) => async (data, callback) => {
    try {
      const { limit = 50, offset = 0 } = data;

      const leaderboard = await playerService.getLeaderboard(limit, offset);

      if (callback) {
        callback({
          success: true,
          ...leaderboard
        });
      } else {
        socket.emit('leaderboard', leaderboard);
      }

    } catch (error) {
      logger.error('Error in getLeaderboard event:', error);
      if (callback) {
        callback({
          success: false,
          error: error.message
        });
      }
    }
  },

  // Handle player achievement
  handleAchievement: async (playerId, achievement, io) => {
    try {
      const player = await Player.findById(playerId);
      
      io.to(`user:${playerId}`).emit('achievement_unlocked', {
        achievement,
        player: {
          id: player._id,
          username: player.telegramUsername
        },
        timestamp: new Date()
      });

      logger.info(`Achievement unlocked for player ${playerId}: ${achievement}`);

    } catch (error) {
      logger.error('Error in handleAchievement:', error);
    }
  },

  // Handle level up
  handleLevelUp: async (playerId, oldLevel, newLevel, io) => {
    try {
      const player = await Player.findById(playerId);
      
      io.to(`user:${playerId}`).emit('level_up', {
        oldLevel,
        newLevel,
        player: {
          id: player._id,
          username: player.telegramUsername
        },
        reward: newLevel * 10, // coins reward
        timestamp: new Date()
      });

      logger.info(`Player ${playerId} leveled up from ${oldLevel} to ${newLevel}`);

    } catch (error) {
      logger.error('Error in handleLevelUp:', error);
    }
  }
};
