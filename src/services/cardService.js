const BingoCard = require('../models/BingoCard');
const { GAME_CONSTANTS } = require('../config/constants');
const logger = require('../utils/logger');

class CardService {
  // Generate a new bingo card for a player
  async generateCard(playerId, gameId) {
    try {
      const card = await BingoCard.generateCard(playerId, gameId);
      await card.save();

      logger.info(`Generated bingo card ${card.cardId} for player ${playerId} in game ${gameId}`);

      return card;
    } catch (error) {
      logger.error('Error generating bingo card:', error);
      throw error;
    }
  }

  // Get card by ID
  async getCard(cardId) {
    try {
      const card = await BingoCard.findById(cardId)
        .populate('player', 'telegramUsername firstName lastName')
        .populate('game', 'gameId');

      if (!card) {
        throw new Error('Card not found');
      }

      return card;
    } catch (error) {
      logger.error('Error getting card:', error);
      throw error;
    }
  }

  // Get cards by player and game
  async getCardsByPlayerAndGame(playerId, gameId) {
    try {
      return await BingoCard.find({ 
        player: playerId, 
        game: gameId 
      });
    } catch (error) {
      logger.error('Error getting cards by player and game:', error);
      throw error;
    }
  }

  // Mark a number on the card
  async markNumber(cardId, number, autoMark = false) {
    try {
      const card = await BingoCard.findById(cardId);
      if (!card) {
        throw new Error('Card not found');
      }

      if (card.hasBingo) {
        throw new Error('Card already has bingo');
      }

      await card.markNumber(number);

      // Check for bingo after marking
      const winningPattern = card.checkBingo();
      if (winningPattern) {
        card.hasBingo = true;
        card.winningPattern = winningPattern.name;
        card.bingoDeclaredAt = new Date();
        await card.save();

        logger.info(`Bingo achieved on card ${cardId} with pattern: ${winningPattern.name}`);
      }

      return {
        card,
        bingo: !!winningPattern,
        winningPattern: winningPattern || null
      };
    } catch (error) {
      logger.error('Error marking number on card:', error);
      throw error;
    }
  }

  // Auto-mark numbers based on called numbers
  async autoMarkNumbers(cardId, calledNumbers) {
    try {
      const card = await BingoCard.findById(cardId);
      if (!card) {
        throw new Error('Card not found');
      }

      let markedCount = 0;
      const newlyMarked = [];

      for (const number of calledNumbers) {
        // Check if number is in card and not already marked
        if (this.isNumberInCard(card, number) && 
            !card.markedNumbers.some(mn => mn.number === number)) {
          
          const position = card.findNumberPosition(number);
          await card.markNumber(number, position);
          markedCount++;
          newlyMarked.push(number);
        }
      }

      // Check for bingo after auto-marking
      const winningPattern = card.checkBingo();
      if (winningPattern) {
        card.hasBingo = true;
        card.winningPattern = winningPattern.name;
        card.bingoDeclaredAt = new Date();
      }

      await card.save();

      return {
        card,
        markedCount,
        newlyMarked,
        hasBingo: !!winningPattern,
        winningPattern: winningPattern || null
      };
    } catch (error) {
      logger.error('Error auto-marking numbers:', error);
      throw error;
    }
  }

  // Check if number is in card
  isNumberInCard(card, number) {
    const letters = ['B', 'I', 'N', 'G', 'O'];
    for (const letter of letters) {
      if (card.numbers[letter].includes(number)) {
        return true;
      }
    }
    return false;
  }

  // Get card display format
  async getCardDisplay(cardId) {
    try {
      const card = await BingoCard.findById(cardId);
      if (!card) {
        throw new Error('Card not found');
      }

      return card.getCardDisplay();
    } catch (error) {
      logger.error('Error getting card display:', error);
      throw error;
    }
  }

  // Validate card structure
  validateCardStructure(card) {
    try {
      const letters = ['B', 'I', 'N', 'G', 'O'];
      const ranges = GAME_CONSTANTS.CARD.NUMBER_RANGES;

      for (const letter of letters) {
        const numbers = card.numbers[letter];
        const range = ranges[letter];

        // Check array length
        if (numbers.length !== 5) {
          return false;
        }

        // Check number ranges
        for (const number of numbers) {
          if (number === null) continue; // Free space

          if (number < range.min || number > range.max) {
            return false;
          }
        }

        // Check for duplicates within column
        const uniqueNumbers = new Set(numbers.filter(n => n !== null));
        if (uniqueNumbers.size !== numbers.filter(n => n !== null).length) {
          return false;
        }
      }

      // Check free space position
      if (card.numbers.N[2] !== null) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error validating card structure:', error);
      return false;
    }
  }

  // Get card statistics
  async getCardStatistics(playerId, limit = 100) {
    try {
      const stats = await BingoCard.aggregate([
        {
          $match: {
            player: playerId,
            hasBingo: true
          }
        },
        {
          $group: {
            _id: '$winningPattern',
            count: { $sum: 1 },
            averageMarkedCount: { $avg: { $size: '$markedNumbers' } },
            fastestBingo: { $min: '$bingoDeclaredAt' }
          }
        },
        {
          $project: {
            pattern: '$_id',
            count: 1,
            averageMarkedCount: { $round: ['$averageMarkedCount', 2] },
            fastestBingo: 1,
            _id: 0
          }
        }
      ]);

      const totalCards = await BingoCard.countDocuments({ player: playerId });
      const winningCards = await BingoCard.countDocuments({ 
        player: playerId, 
        hasBingo: true 
      });

      return {
        totalCards,
        winningCards,
        winRate: totalCards > 0 ? (winningCards / totalCards * 100).toFixed(1) : 0,
        patternStats: stats
      };
    } catch (error) {
      logger.error('Error getting card statistics:', error);
      throw error;
    }
  }

  // Clean up old cards
  async cleanupOldCards() {
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    const result = await BingoCard.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    logger.info(`Cleaned up ${result.deletedCount} old bingo cards`);

    return result.deletedCount;
  }
}

module.exports = new CardService();
