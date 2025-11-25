const BingoCard = require('../models/BingoCard');
const { GAME_CONSTANTS, ERROR_MESSAGES } = require('../config/constants');
const logger = require('../utils/logger');

class BingoService {
  // Validate a bingo claim
  async validateBingo(cardId, calledNumbers) {
    try {
      const card = await BingoCard.findById(cardId);
      if (!card) {
        throw new Error(ERROR_MESSAGES.GAME.INVALID_CARD);
      }

      // Check if the card has bingo
      const winningPattern = card.checkBingo();
      if (!winningPattern) {
        throw new Error(ERROR_MESSAGES.BINGO.PATTERN_NOT_COMPLETE);
      }

      // Verify that all winning numbers are in the called numbers
      const calledNumbersSet = new Set(calledNumbers);
      const allNumbersCalled = winningPattern.numbers.every(num => 
        num === null || calledNumbersSet.has(num) // null represents free space
      );

      if (!allNumbersCalled) {
        throw new Error('Not all winning numbers have been called');
      }

      return winningPattern;
    } catch (error) {
      logger.error('Error validating bingo:', error);
      throw error;
    }
  }

  // Check if a number is in the card
  isNumberInCard(card, number) {
    const letters = ['B', 'I', 'N', 'G', 'O'];
    for (let col = 0; col < 5; col++) {
      const letter = letters[col];
      if (card.numbers[letter].includes(number)) {
        return true;
      }
    }
    return false;
  }

  // Get all possible winning patterns for analysis
  getAllPossiblePatterns() {
    return {
      rows: this.generateRowPatterns(),
      columns: this.generateColumnPatterns(),
      diagonals: this.generateDiagonalPatterns(),
      corners: this.generateCornerPattern(),
      fullHouse: this.generateFullHousePattern()
    };
  }

  generateRowPatterns() {
    const patterns = [];
    for (let row = 0; row < 5; row++) {
      const pattern = [];
      for (let col = 0; col < 5; col++) {
        pattern.push({ row, col });
      }
      patterns.push({
        name: GAME_CONSTANTS.WINNING_PATTERNS.LINE,
        type: 'row',
        index: row,
        positions: pattern
      });
    }
    return patterns;
  }

  generateColumnPatterns() {
    const patterns = [];
    for (let col = 0; col < 5; col++) {
      const pattern = [];
      for (let row = 0; row < 5; row++) {
        pattern.push({ row, col });
      }
      patterns.push({
        name: GAME_CONSTANTS.WINNING_PATTERNS.LINE,
        type: 'column',
        index: col,
        positions: pattern
      });
    }
    return patterns;
  }

  generateDiagonalPatterns() {
    const diag1 = [];
    const diag2 = [];
    for (let i = 0; i < 5; i++) {
      diag1.push({ row: i, col: i });
      diag2.push({ row: i, col: 4 - i });
    }
    return [
      {
        name: GAME_CONSTANTS.WINNING_PATTERNS.DIAGONAL,
        type: 'diagonal1',
        positions: diag1
      },
      {
        name: GAME_CONSTANTS.WINNING_PATTERNS.DIAGONAL,
        type: 'diagonal2',
        positions: diag2
      }
    ];
  }

  generateCornerPattern() {
    return {
      name: GAME_CONSTANTS.WINNING_PATTERNS.FOUR_CORNERS,
      type: 'corners',
      positions: [
        { row: 0, col: 0 },
        { row: 0, col: 4 },
        { row: 4, col: 0 },
        { row: 4, col: 4 }
      ]
    };
  }

  generateFullHousePattern() {
    const positions = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        positions.push({ row, col });
      }
    }
    return {
      name: GAME_CONSTANTS.WINNING_PATTERNS.FULL_HOUSE,
      type: 'full_house',
      positions
    };
  }

  // Analyze card for potential wins
  async analyzeCardPotential(cardId, calledNumbers) {
    try {
      const card = await BingoCard.findById(cardId);
      if (!card) {
        throw new Error('Card not found');
      }

      const patterns = this.getAllPossiblePatterns();
      const analysis = {
        potentialWins: [],
        numbersNeeded: {},
        closestWin: null
      };

      // Check each pattern type
      for (const [patternType, patternList] of Object.entries(patterns)) {
        for (const pattern of patternList) {
          const result = this.analyzePattern(card, pattern, calledNumbers);
          if (result) {
            analysis.potentialWins.push(result);
          }
        }
      }

      // Find closest win (fewest numbers needed)
      if (analysis.potentialWins.length > 0) {
        analysis.closestWin = analysis.potentialWins.reduce((closest, current) => {
          return current.numbersNeeded < closest.numbersNeeded ? current : closest;
        });
      }

      return analysis;
    } catch (error) {
      logger.error('Error analyzing card potential:', error);
      throw error;
    }
  }

  analyzePattern(card, pattern, calledNumbers) {
    const uncalledNumbers = [];
    let markedCount = 0;

    for (const position of pattern.positions) {
      const number = card.getNumberAt(position.row, position.col);
      
      // Skip free space (always marked)
      if (number === null) {
        markedCount++;
        continue;
      }

      if (card.markedNumbers.some(mn => mn.number === number)) {
        markedCount++;
      } else if (!calledNumbers.includes(number)) {
        uncalledNumbers.push({
          number,
          position,
          letter: this.getLetterForNumber(number)
        });
      }
    }

    if (uncalledNumbers.length === 0 && markedCount === pattern.positions.length) {
      return {
        pattern: pattern.name,
        type: pattern.type,
        isComplete: true,
        numbersNeeded: 0,
        positions: pattern.positions
      };
    }

    if (uncalledNumbers.length > 0 && uncalledNumbers.length <= 2) {
      return {
        pattern: pattern.name,
        type: pattern.type,
        isComplete: false,
        numbersNeeded: uncalledNumbers.length,
        uncalledNumbers,
        markedCount,
        totalPositions: pattern.positions.length
      };
    }

    return null;
  }

  getLetterForNumber(number) {
    if (number <= 15) return 'B';
    if (number <= 30) return 'I';
    if (number <= 45) return 'N';
    if (number <= 60) return 'G';
    return 'O';
  }

  // Get card statistics
  async getCardStats(cardId) {
    try {
      const card = await BingoCard.findById(cardId);
      if (!card) {
        throw new Error('Card not found');
      }

      const markedCount = card.markedNumbers.length;
      const totalNumbers = 24; // 5x5 grid minus free space

      return {
        cardId: card.cardId,
        markedCount,
        totalNumbers,
        completionPercentage: Math.round((markedCount / totalNumbers) * 100),
        hasBingo: card.hasBingo,
        winningPattern: card.winningPattern,
        numbersMarked: card.markedNumbers.map(mn => ({
          number: mn.number,
          position: mn.position,
          markedAt: mn.markedAt
        }))
      };
    } catch (error) {
      logger.error('Error getting card stats:', error);
      throw error;
    }
  }

  // Simulate bingo game for testing
  async simulateBingoGame(cardId, numbersToCall = 35) {
    try {
      const card = await BingoCard.findById(cardId);
      if (!card) {
        throw new Error('Card not found');
      }

      const simulation = {
        card: card.getCardDisplay(),
        calledNumbers: [],
        markedNumbers: [],
        bingoAchieved: false,
        turnsToBingo: null,
        winningPattern: null
      };

      // Generate random numbers to call
      const allNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
      const shuffledNumbers = this.shuffleArray(allNumbers).slice(0, numbersToCall);

      for (let i = 0; i < shuffledNumbers.length; i++) {
        const number = shuffledNumbers[i];
        simulation.calledNumbers.push(number);

        // Check if number is in card and mark it
        if (this.isNumberInCard(card, number)) {
          card.markNumber(number);
          simulation.markedNumbers.push({
            number,
            turn: i + 1,
            position: card.findNumberPosition(number)
          });

          // Check for bingo
          const winningPattern = card.checkBingo();
          if (winningPattern && !simulation.bingoAchieved) {
            simulation.bingoAchieved = true;
            simulation.turnsToBingo = i + 1;
            simulation.winningPattern = winningPattern;
            break;
          }
        }
      }

      // Reset card for actual gameplay
      await BingoCard.findByIdAndUpdate(cardId, {
        markedNumbers: [],
        hasBingo: false,
        winningPattern: null
      });

      return simulation;
    } catch (error) {
      logger.error('Error simulating bingo game:', error);
      throw error;
    }
  }

  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

module.exports = new BingoService();
