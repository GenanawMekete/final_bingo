const Player = require('../models/Player');
const Transaction = require('../models/Transaction');
const { ERROR_MESSAGES } = require('../config/constants');
const logger = require('../utils/logger');

class PlayerService {
  // Create or update player from Telegram data
  async createOrUpdatePlayer(telegramUser) {
    try {
      const { id, username, first_name, last_name, language_code } = telegramUser;

      let player = await Player.findByTelegramId(id);

      if (player) {
        // Update existing player
        player.telegramUsername = username || player.telegramUsername;
        player.firstName = first_name || player.firstName;
        player.lastName = last_name || player.lastName;
        player.languageCode = language_code || player.languageCode;
        player.lastActive = new Date();
        player.isOnline = true;
      } else {
        // Create new player
        player = new Player({
          telegramId: id,
          telegramUsername: username,
          firstName: first_name,
          lastName: last_name,
          languageCode: language_code,
          isOnline: true,
          lastActive: new Date(),
        });

        // Give welcome bonus
        player.coins += 100;
      }

      await player.save();

      logger.info(`Player ${player.telegramUsername} (${player.telegramId}) created/updated`);

      return player;
    } catch (error) {
      logger.error('Error creating/updating player:', error);
      throw error;
    }
  }

  // Get player by Telegram ID
  async getPlayerByTelegramId(telegramId) {
    try {
      return await Player.findByTelegramId(telegramId);
    } catch (error) {
      logger.error('Error getting player by Telegram ID:', error);
      throw error;
    }
  }

  // Get player by ID
  async getPlayer(playerId) {
    try {
      const player = await Player.findById(playerId);
      if (!player) {
        throw new Error(ERROR_MESSAGES.PLAYER.NOT_FOUND);
      }
      return player;
    } catch (error) {
      logger.error('Error getting player:', error);
      throw error;
    }
  }

  // Update player online status
  async updateOnlineStatus(playerId, isOnline) {
    try {
      const player = await Player.findById(playerId);
      if (!player) {
        throw new Error(ERROR_MESSAGES.PLAYER.NOT_FOUND);
      }

      player.isOnline = isOnline;
      player.lastActive = new Date();
      
      await player.save();

      return player;
    } catch (error) {
      logger.error('Error updating player online status:', error);
      throw error;
    }
  }

  // Update player settings
  async updatePlayerSettings(playerId, settings) {
    try {
      const player = await Player.findById(playerId);
      if (!player) {
        throw new Error(ERROR_MESSAGES.PLAYER.NOT_FOUND);
      }

      player.settings = { ...player.settings, ...settings };
      await player.save();

      return player;
    } catch (error) {
      logger.error('Error updating player settings:', error);
      throw error;
    }
  }

  // Add coins to player
  async addCoins(playerId, amount, reason = 'bonus') {
    try {
      const player = await Player.findById(playerId);
      if (!player) {
        throw new Error(ERROR_MESSAGES.PLAYER.NOT_FOUND);
      }

      await player.addCoins(amount, reason);

      // Record transaction
      await Transaction.createTransaction({
        player: playerId,
        type: reason,
        category: 'credit',
        amount,
        description: `Received ${amount} coins for ${reason}`,
      });

      logger.info(`Added ${amount} coins to player ${playerId} for ${reason}`);

      return player;
    } catch (error) {
      logger.error('Error adding coins to player:', error);
      throw error;
    }
  }

  // Deduct coins from player
  async deductCoins(playerId, amount, reason = 'purchase') {
    try {
      const player = await Player.findById(playerId);
      if (!player) {
        throw new Error(ERROR_MESSAGES.PLAYER.NOT_FOUND);
      }

      if (player.coins < amount) {
        throw new Error(ERROR_MESSAGES.PLAYER.INSUFFICIENT_COINS);
      }

      await player.deductCoins(amount, reason);

      // Record transaction
      await Transaction.createTransaction({
        player: playerId,
        type: reason,
        category: 'debit',
        amount,
        description: `Spent ${amount} coins for ${reason}`,
      });

      logger.info(`Deducted ${amount} coins from player ${playerId} for ${reason}`);

      return player;
    } catch (error) {
      logger.error('Error deducting coins from player:', error);
      throw error;
    }
  }

  // Get player statistics
  async getPlayerStats(playerId) {
    try {
      const player = await Player.findById(playerId);
      if (!player) {
        throw new Error(ERROR_MESSAGES.PLAYER.NOT_FOUND);
      }

      const transactions = await Transaction.getPlayerStats(playerId);
      const leaderboardPosition = await this.getLeaderboardPosition(playerId);

      return {
        player: {
          ...player.toJSON(),
          winRate: player.winRate,
        },
        transactions,
        leaderboardPosition,
      };
    } catch (error) {
      logger.error('Error getting player stats:', error);
      throw error;
    }
  }

  // Get leaderboard
  async getLeaderboard(limit = 50, offset = 0) {
    try {
      const players = await Player.find({ totalGames: { $gt: 0 } })
        .sort({ gamesWon: -1, totalGames: 1, experience: -1 })
        .skip(offset)
        .limit(limit)
        .select('telegramUsername firstName lastName gamesWon totalGames winRate level coins experience');

      const totalPlayers = await Player.countDocuments({ totalGames: { $gt: 0 } });

      return {
        players,
        totalPlayers,
        hasMore: offset + players.length < totalPlayers,
      };
    } catch (error) {
      logger.error('Error getting leaderboard:', error);
      throw error;
    }
  }

  // Get player's leaderboard position
  async getLeaderboardPosition(playerId) {
    try {
      const player = await Player.findById(playerId);
      if (!player) {
        return null;
      }

      const position = await Player.countDocuments({
        $or: [
          { gamesWon: { $gt: player.gamesWon } },
          { 
            gamesWon: player.gamesWon,
            totalGames: { $lt: player.totalGames }
          },
          {
            gamesWon: player.gamesWon,
            totalGames: player.totalGames,
            experience: { $gt: player.experience }
          }
        ]
      });

      return position + 1;
    } catch (error) {
      logger.error('Error getting leaderboard position:', error);
      return null;
    }
  }

  // Process referral
  async processReferral(referrerId, referredPlayerId) {
    try {
      const referrer = await Player.findById(referrerId);
      const referredPlayer = await Player.findById(referredPlayerId);

      if (!referrer || !referredPlayer) {
        throw new Error('Invalid referral data');
      }

      // Check if already referred
      if (referredPlayer.referredBy) {
        throw new Error('Player already referred');
      }

      // Update referred player
      referredPlayer.referredBy = referrerId;
      await referredPlayer.save();

      // Award referral bonus to referrer
      const referralBonus = 25; // From constants
      await this.addCoins(referrerId, referralBonus, 'referral');

      // Update referrer's referral count
      referrer.referralsCount += 1;
      await referrer.save();

      logger.info(`Referral processed: ${referredPlayerId} referred by ${referrerId}`);

      return {
        referrer,
        referredPlayer,
        bonusAwarded: referralBonus,
      };
    } catch (error) {
      logger.error('Error processing referral:', error);
      throw error;
    }
  }

  // Clean up inactive players
  async cleanupInactivePlayers() {
    const cutoffTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    const result = await Player.updateMany(
      {
        lastActive: { $lt: cutoffTime },
        isOnline: true
      },
      {
        isOnline: false
      }
    );

    logger.info(`Updated ${result.modifiedCount} players to offline status`);

    return result.modifiedCount;
  }
}

module.exports = new PlayerService();
