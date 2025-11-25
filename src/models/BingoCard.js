const mongoose = require('mongoose');
const { GAME_CONSTANTS } = require('../config/constants');

const bingoCardSchema = new mongoose.Schema({
  // Card Identification
  cardId: {
    type: String,
    required: true,
    unique: true
  },
  player: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  game: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game',
    required: true
  },

  // Card Numbers (5x5 grid)
  numbers: {
    B: [{ type: Number, min: 1, max: 15 }],
    I: [{ type: Number, min: 16, max: 30 }],
    N: [{ type: Number, min: 31, max: 45 }],
    G: [{ type: Number, min: 46, max: 60 }],
    O: [{ type: Number, min: 61, max: 75 }]
  },

  // Marked numbers tracking
  markedNumbers: [{
    number: {
      type: Number,
      required: true
    },
    position: {
      row: { type: Number, min: 0, max: 4 },
      col: { type: Number, min: 0, max: 4 }
    },
    markedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Winning state
  hasBingo: {
    type: Boolean,
    default: false
  },
  winningPattern: {
    type: String,
    enum: Object.values(GAME_CONSTANTS.WINNING_PATTERNS)
  },
  winningNumbers: [Number],
  bingoDeclaredAt: Date,

  // Card metadata
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 * 7 // Auto-delete after 7 days
  }

}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
bingoCardSchema.index({ cardId: 1 });
bingoCardSchema.index({ player: 1 });
bingoCardSchema.index({ game: 1 });
bingoCardSchema.index({ hasBingo: 1 });
bingoCardSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

// Virtual for marked count
bingoCardSchema.virtual('markedCount').get(function() {
  return this.markedNumbers.length;
});

// Virtual for checking if center is free (standard bingo rule)
bingoCardSchema.virtual('freeSpace').get(function() {
  return { row: 2, col: 2 }; // Center position
});

// Instance Methods
bingoCardSchema.methods.markNumber = function(number, position = null) {
  // Check if number is already marked
  const alreadyMarked = this.markedNumbers.some(mn => mn.number === number);
  if (alreadyMarked) {
    return this;
  }

  // If position not provided, find it in the card
  if (!position) {
    position = this.findNumberPosition(number);
  }

  if (!position) {
    throw new Error(`Number ${number} not found in card`);
  }

  this.markedNumbers.push({
    number,
    position,
    markedAt: new Date()
  });

  return this.save();
};

bingoCardSchema.methods.findNumberPosition = function(number) {
  const letters = ['B', 'I', 'N', 'G', 'O'];
  
  for (let col = 0; col < 5; col++) {
    const letter = letters[col];
    const numbers = this.numbers[letter];
    
    for (let row = 0; row < 5; row++) {
      if (numbers[row] === number) {
        return { row, col };
      }
    }
  }
  
  return null;
};

bingoCardSchema.methods.getNumberAt = function(row, col) {
  const letters = ['B', 'I', 'N', 'G', 'O'];
  const letter = letters[col];
  return this.numbers[letter][row];
};

bingoCardSchema.methods.isMarked = function(row, col) {
  // Center is always considered marked
  if (row === 2 && col === 2) {
    return true;
  }

  const number = this.getNumberAt(row, col);
  return this.markedNumbers.some(mn => mn.number === number);
};

bingoCardSchema.methods.checkBingo = function() {
  const patterns = this.getWinningPatterns();
  
  for (const pattern of patterns) {
    if (this.checkPattern(pattern)) {
      this.hasBingo = true;
      this.winningPattern = pattern.name;
      this.winningNumbers = pattern.numbers;
      this.bingoDeclaredAt = new Date();
      return pattern;
    }
  }
  
  return null;
};

bingoCardSchema.methods.getWinningPatterns = function() {
  const patterns = [];
  
  // Rows
  for (let row = 0; row < 5; row++) {
    const numbers = [];
    for (let col = 0; col < 5; col++) {
      if (row === 2 && col === 2) continue; // Skip free space
      numbers.push(this.getNumberAt(row, col));
    }
    patterns.push({
      name: GAME_CONSTANTS.WINNING_PATTERNS.LINE,
      type: 'row',
      index: row,
      numbers
    });
  }
  
  // Columns
  for (let col = 0; col < 5; col++) {
    const numbers = [];
    for (let row = 0; row < 5; row++) {
      if (row === 2 && col === 2) continue; // Skip free space
      numbers.push(this.getNumberAt(row, col));
    }
    patterns.push({
      name: GAME_CONSTANTS.WINNING_PATTERNS.LINE,
      type: 'column',
      index: col,
      numbers
    });
  }
  
  // Diagonals
  const diag1 = [], diag2 = [];
  for (let i = 0; i < 5; i++) {
    if (i !== 2) { // Skip center for diagonals
      diag1.push(this.getNumberAt(i, i));
      diag2.push(this.getNumberAt(i, 4 - i));
    }
  }
  
  patterns.push({
    name: GAME_CONSTANTS.WINNING_PATTERNS.DIAGONAL,
    type: 'diagonal1',
    numbers: diag1
  });
  
  patterns.push({
    name: GAME_CONSTANTS.WINNING_PATTERNS.DIAGONAL,
    type: 'diagonal2',
    numbers: diag2
  });
  
  // Four corners
  const corners = [
    this.getNumberAt(0, 0),
    this.getNumberAt(0, 4),
    this.getNumberAt(4, 0),
    this.getNumberAt(4, 4)
  ];
  
  patterns.push({
    name: GAME_CONSTANTS.WINNING_PATTERNS.FOUR_CORNERS,
    type: 'corners',
    numbers: corners
  });
  
  return patterns;
};

bingoCardSchema.methods.checkPattern = function(pattern) {
  return pattern.numbers.every(number => {
    // Free space is always considered marked
    if (number === null) return true;
    
    return this.markedNumbers.some(mn => mn.number === number);
  });
};

bingoCardSchema.methods.getCardDisplay = function() {
  const display = [];
  const letters = ['B', 'I', 'N', 'G', 'O'];
  
  for (let row = 0; row < 5; row++) {
    const rowData = [];
    for (let col = 0; col < 5; col++) {
      const number = this.getNumberAt(row, col);
      const isMarked = this.isMarked(row, col);
      
      rowData.push({
        number,
        isMarked,
        position: { row, col },
        isFreeSpace: (row === 2 && col === 2)
      });
    }
    display.push(rowData);
  }
  
  return display;
};

// Static Methods
bingoCardSchema.statics.generateCard = function(playerId, gameId) {
  const cardId = `CARD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const numbers = {
    B: generateColumnNumbers(1, 15),
    I: generateColumnNumbers(16, 30),
    N: generateColumnNumbers(31, 45),
    G: generateColumnNumbers(46, 60),
    O: generateColumnNumbers(61, 75)
  };
  
  // Make center free (replace with null)
  numbers.N[2] = null;
  
  return new this({
    cardId,
    player: playerId,
    game: gameId,
    numbers
  });
};

// Helper function to generate column numbers
function generateColumnNumbers(min, max) {
  const numbers = [];
  const available = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  
  // Shuffle and take first 5
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  
  return available.slice(0, 5);
}

module.exports = mongoose.model('BingoCard', bingoCardSchema);
