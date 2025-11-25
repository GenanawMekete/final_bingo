const { User, Game, BingoCard, Transaction, Leaderboard } = require('../models');
const logger = require('../utils/logger');

class DatabaseService {
  // User methods
  static async findOrCreateUser(telegramUser) {
    try {
      let user = await User.findOne({ telegramId: telegramUser.id.toString() });
      
      if (!user) {
        user = new User({
          telegramId: telegramUser.id.toString(),
          username: telegramUser.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          languageCode: telegramUser.language_code,
          avatar: telegramUser.photo_url
        });
        
        await user.save();
        logger.info(`New user created: ${user.telegramId}`);
      } else {
        // Update last active
        user.lastActive = new Date();
        await user.save();
      }
      
      return user;
    } catch (error) {
      logger.error('Error in findOrCreateUser:', error);
      throw error;
    }
  }

  static async updateUserStats(userId, hasWon, winnings = 0) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }
      
      const leveledUp = user.updateStats(hasWon, winnings);
      await user.save();
      
      return { user, leveledUp };
    } catch (error) {
      logger.error('Error updating user stats:', error);
      throw error;
    }
  }

  // Game methods
  static async createQuickGame(betAmount = 10) {
    try {
      const game = new Game({
        gameId: `quick_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
        type: 'quick',
        status: 'waiting',
        betAmount,
        maxPlayers: 1000,
        scheduledStart: new Date(Date.now() + 30000), // 30 seconds from now
        gameSettings: {
          interval: 30000,
          numberCallInterval: 2000,
          maxCardsPerPlayer: 6,
          autoStart: true
        }
      });
      
      await game.save();
      logger.info(`Quick game created: ${game.gameId}`);
      
      return game;
    } catch (error) {
      logger.error('Error creating quick game:', error);
      throw error;
    }
  }

  static async joinGame(gameId, userId, selectedCardIds, totalBet) {
    try {
      const game = await Game.findOne({ gameId });
      if (!game) {
        throw new Error('Game not found');
      }
      
      // Check if user can afford the bet
      const user = await User.findById(userId);
      if (!user.canAfford(totalBet)) {
        throw new Error('Insufficient balance');
      }
      
      // Add player to game
      game.addPlayer(userId, selectedCardIds, totalBet);
      
      // Deduct balance from user
      user.deductBalance(totalBet);
      
      await Promise.all([game.save(), user.save()]);
      
      logger.info(`User ${userId} joined game ${gameId} with bet ${totalBet}`);
      
      return game;
    } catch (error) {
      logger.error('Error joining game:', error);
      throw error;
    }
  }

  static async generateBingoCards(userId, gameId, count) {
    try {
      const cards = [];
      
      for (let i = 0; i < count; i++) {
        const cardData = BingoCard.generateCard(userId, gameId);
        const card = new BingoCard(cardData);
        await card.save();
        cards.push(card);
      }
      
      return cards;
    } catch (error) {
      logger.error('Error generating bingo cards:', error);
      throw error;
    }
  }

  // Transaction methods
  static async recordGameBet(userId, gameId, amount, cardCount) {
    try {
      const transaction = await Transaction.createTransaction(
        userId,
        'game_bet',
        amount,
        `Game bet for ${cardCount} cards`,
        { gameId, cardCount }
      );
      
      return transaction;
    } catch (error) {
      logger.error('Error recording game bet:', error);
      throw error;
    }
  }

  static async recordGameWin(userId, gameId, amount, pattern) {
    try {
      const transaction = await Transaction.createTransaction(
        userId,
        'game_win',
        amount,
        `Game win with ${pattern} pattern`,
        { gameId, pattern }
      );
      
      return transaction;
    } catch (error) {
      logger.error('Error recording game win:', error);
      throw error;
    }
  }

  // Leaderboard methods
  static async updateLeaderboards() {
    try {
      const periods = ['daily', 'weekly', 'monthly'];
      
      for (const period of periods) {
        await Leaderboard.updateLeaderboard(period);
        logger.info(`Updated ${period} leaderboard`);
      }
      
      return true;
    } catch (error) {
      logger.error('Error updating leaderboards:', error);
      throw error;
    }
  }

  // Analytics methods
  static async getGameAnalytics() {
    try {
      const totalGames = await Game.countDocuments();
      const activeGames = await Game.countDocuments({ 
        status: { $in: ['waiting', 'starting', 'playing'] } 
      });
      const totalPlayers = await User.countDocuments({ isActive: true });
      const totalPot = await Game.aggregate([
        { $match: { status: 'ended' } },
        { $group: { _id: null, total: { $sum: '$potSize' } } }
      ]);
      
      return {
        totalGames,
        activeGames,
        totalPlayers,
        totalPot: totalPot[0]?.total || 0
      };
    } catch (error) {
      logger.error('Error getting game analytics:', error);
      throw error;
    }
  }
}

module.exports = DatabaseService;
