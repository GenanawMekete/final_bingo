const mongoose = require('mongoose');
const { GAME_CONSTANTS } = require('../config/constants');

const gameSchema = new mongoose.Schema({
  // Game Identification
  gameId: {
    type: String,
    required: true,
    unique: true
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },

  // Game State
  status: {
    type: String,
    enum: Object.values(GAME_CONSTANTS.STATUS),
    default: GAME_CONSTANTS.STATUS.WAITING
  },
  phase: {
    type: String,
    enum: ['lobby', 'playing', 'results'],
    default: 'lobby'
  },

  // Players
  players: [{
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true
    },
    bingoCard: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BingoCard',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    isReady: {
      type: Boolean,
      default: false
    },
    hasClaimedBingo: {
      type: Boolean,
      default: false
    },
    claimTime: Date
  }],

  // Game Configuration
  config: {
    duration: {
      type: Number,
      default: GAME_CONSTANTS.TIMERS.GAME
    },
    maxPlayers: {
      type: Number,
      default: GAME_CONSTANTS.game.maxPlayers
    },
    minPlayers: {
      type: Number,
      default: GAME_CONSTANTS.game.minPlayers
    },
    entryFee: {
      type: Number,
      default: 0
    },
    prizePool: {
      type: Number,
      default: 0
    }
  },

  // Game Progress
  calledNumbers: [{
    number: {
      type: Number,
      required: true,
      min: 1,
      max: 75
    },
    letter: {
      type: String,
      enum: ['B', 'I', 'N', 'G', 'O'],
      required: true
    },
    calledAt: {
      type: Date,
      default: Date.now
    },
    callOrder: {
      type: Number,
      required: true
    }
  }],

  currentNumber: {
    number: Number,
    letter: String,
    calledAt: Date
  },

  // Timers
  startTime: Date,
  endTime: Date,
  actualStartTime: Date,
  actualEndTime: Date,

  // Results
  winners: [{
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player'
    },
    bingoCard: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BingoCard'
    },
    pattern: {
      type: String,
      enum: Object.values(GAME_CONSTANTS.WINNING_PATTERNS)
    },
    prize: Number,
    claimTime: Date,
    winningNumbers: [Number]
  }],

  // Statistics
  stats: {
    totalCalls: {
      type: Number,
      default: 0
    },
    averageClaimTime: Number,
    fastestBingo: Number // in seconds
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
gameSchema.index({ gameId: 1 });
gameSchema.index({ status: 1 });
gameSchema.index({ room: 1 });
gameSchema.index({ startTime: 1 });
gameSchema.index({ 'players.player': 1 });
gameSchema.index({ createdAt: 1 });

// Virtuals
gameSchema.virtual('playerCount').get(function() {
  return this.players.length;
});

gameSchema.virtual('isFull').get(function() {
  return this.players.length >= this.config.maxPlayers;
});

gameSchema.virtual('canStart').get(function() {
  return this.players.length >= this.config.minPlayers && this.status === GAME_CONSTANTS.STATUS.WAITING;
});

gameSchema.virtual('timeElapsed').get(function() {
  if (!this.actualStartTime) return 0;
  const end = this.actualEndTime || new Date();
  return Math.floor((end - this.actualStartTime) / 1000);
});

gameSchema.virtual('timeRemaining').get(function() {
  if (this.status !== GAME_CONSTANTS.STATUS.IN_PROGRESS) return 0;
  const elapsed = this.timeElapsed;
  return Math.max(0, this.config.duration - elapsed);
});

// Instance Methods
gameSchema.methods.addPlayer = function(playerId, bingoCardId) {
  if (this.isFull) {
    throw new Error('Game is full');
  }
  
  if (this.status !== GAME_CONSTANTS.STATUS.WAITING) {
    throw new Error('Game has already started');
  }

  // Check if player already in game
  const existingPlayer = this.players.find(p => p.player.toString() === playerId.toString());
  if (existingPlayer) {
    throw new Error('Player already in game');
  }

  this.players.push({
    player: playerId,
    bingoCard: bingoCardId,
    joinedAt: new Date()
  });

  return this.save();
};

gameSchema.methods.removePlayer = function(playerId) {
  const playerIndex = this.players.findIndex(p => p.player.toString() === playerId.toString());
  
  if (playerIndex === -1) {
    throw new Error('Player not found in game');
  }

  this.players.splice(playerIndex, 1);
  return this.save();
};

gameSchema.methods.callNumber = function() {
  if (this.status !== GAME_CONSTANTS.STATUS.IN_PROGRESS) {
    throw new Error('Game is not in progress');
  }

  // Generate unique number that hasn't been called
  const calledNumbers = new Set(this.calledNumbers.map(cn => cn.number));
  let number, letter;
  
  do {
    number = Math.floor(Math.random() * 75) + 1;
    
    // Determine letter based on number range
    if (number <= 15) letter = 'B';
    else if (number <= 30) letter = 'I';
    else if (number <= 45) letter = 'N';
    else if (number <= 60) letter = 'G';
    else letter = 'O';
    
  } while (calledNumbers.has(number));

  const callOrder = this.calledNumbers.length + 1;
  
  const calledNumber = {
    number,
    letter,
    callOrder,
    calledAt: new Date()
  };

  this.calledNumbers.push(calledNumber);
  this.currentNumber = calledNumber;
  this.stats.totalCalls = callOrder;

  return this.save();
};

gameSchema.methods.claimBingo = function(playerId, pattern, winningNumbers) {
  if (this.status !== GAME_CONSTANTS.STATUS.IN_PROGRESS) {
    throw new Error('Game is not in progress');
  }

  const playerEntry = this.players.find(p => p.player.toString() === playerId.toString());
  if (!playerEntry) {
    throw new Error('Player not in game');
  }

  if (playerEntry.hasClaimedBingo) {
    throw new Error('Player has already claimed bingo');
  }

  // Check if bingo is already claimed in this game
  if (this.winners.length > 0) {
    throw new Error('Bingo already claimed in this game');
  }

  const claimTime = new Date();
  const timeToWin = Math.floor((claimTime - this.actualStartTime) / 1000);

  // Calculate prize
  const basePrize = GAME_CONSTANTS.REWARDS.BASE_PRIZE;
  const speedBonus = Math.max(0, GAME_CONSTANTS.REWARDS.SPEED_BONUS - Math.floor(timeToWin / 5));
  const patternBonus = pattern === GAME_CONSTANTS.WINNING_PATTERNS.FULL_HOUSE ? 
    GAME_CONSTANTS.REWARDS.FULL_HOUSE_BONUS : 0;
  
  const totalPrize = basePrize + speedBonus + patternBonus;

  // Add to winners
  this.winners.push({
    player: playerId,
    bingoCard: playerEntry.bingoCard,
    pattern,
    prize: totalPrize,
    claimTime,
    winningNumbers
  });

  playerEntry.hasClaimedBingo = true;
  playerEntry.claimTime = claimTime;

  // Update game stats
  if (!this.stats.fastestBingo || timeToWin < this.stats.fastestBingo) {
    this.stats.fastestBingo = timeToWin;
  }

  this.status = GAME_CONSTANTS.STATUS.FINISHED;
  this.actualEndTime = claimTime;

  return this.save();
};

gameSchema.methods.startGame = function() {
  if (this.status !== GAME_CONSTANTS.STATUS.WAITING) {
    throw new Error('Game cannot be started');
  }

  if (!this.canStart) {
    throw new Error('Not enough players to start game');
  }

  this.status = GAME_CONSTANTS.STATUS.IN_PROGRESS;
  this.phase = 'playing';
  this.actualStartTime = new Date();
  this.startTime = new Date();
  this.endTime = new Date(Date.now() + this.config.duration * 1000);

  return this.save();
};

gameSchema.methods.endGame = function(reason = 'time_up') {
  if (this.status === GAME_CONSTANTS.STATUS.FINISHED) {
    return this;
  }

  this.status = GAME_CONSTANTS.STATUS.FINISHED;
  this.phase = 'results';
  this.actualEndTime = new Date();

  // If no winners and there's a prize pool, distribute among active players
  if (this.winners.length === 0 && this.config.prizePool > 0) {
    const consolationPrize = Math.floor(this.config.prizePool / this.players.length);
    // This would be handled by the game service
  }

  return this.save();
};

// Static Methods
gameSchema.statics.findActiveGames = function() {
  return this.find({
    status: { $in: [GAME_CONSTANTS.STATUS.WAITING, GAME_CONSTANTS.STATUS.IN_PROGRESS] }
  }).populate('players.player', 'telegramUsername firstName lastName');
};

gameSchema.statics.findByPlayer = function(playerId) {
  return this.findOne({
    'players.player': playerId,
    status: { $in: [GAME_CONSTANTS.STATUS.WAITING, GAME_CONSTANTS.STATUS.IN_PROGRESS] }
  });
};

gameSchema.statics.getGameStats = function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate },
        status: GAME_CONSTANTS.STATUS.FINISHED
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
};

module.exports = mongoose.model('Game', gameSchema);
