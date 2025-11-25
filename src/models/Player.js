const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const playerSchema = new mongoose.Schema({
  // Telegram User Data
  telegramId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  telegramUsername: {
    type: String,
    trim: true,
    lowercase: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 64
  },
  lastName: {
    type: String,
    trim: true,
    maxlength: 64
  },
  languageCode: {
    type: String,
    default: 'en'
  },

  // Game Stats & Economy
  coins: {
    type: Number,
    default: 100,
    min: 0
  },
  totalGames: {
    type: Number,
    default: 0
  },
  gamesWon: {
    type: Number,
    default: 0
  },
  totalBingos: {
    type: Number,
    default: 0
  },
  experience: {
    type: Number,
    default: 0
  },
  level: {
    type: Number,
    default: 1
  },

  // Game State
  currentGame: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game'
  },
  currentRoom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastActive: {
    type: Date,
    default: Date.now
  },

  // Preferences
  settings: {
    soundEnabled: {
      type: Boolean,
      default: true
    },
    vibrationEnabled: {
      type: Boolean,
      default: true
    },
    autoMarkNumbers: {
      type: Boolean,
      default: false
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    }
  },

  // Social & Referrals
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  },
  referralsCount: {
    type: Number,
    default: 0
  },

  // Authentication (for admin purposes)
  authToken: String,
  tokenExpires: Date

}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.authToken;
      return ret;
    }
  }
});

// Indexes for better query performance
playerSchema.index({ telegramId: 1 });
playerSchema.index({ telegramUsername: 1 });
playerSchema.index({ isOnline: 1 });
playerSchema.index({ coins: -1 });
playerSchema.index({ totalGames: -1 });
playerSchema.index({ gamesWon: -1 });
playerSchema.index({ createdAt: -1 });

// Virtual for win rate
playerSchema.virtual('winRate').get(function() {
  return this.totalGames > 0 ? (this.gamesWon / this.totalGames * 100).toFixed(1) : 0;
});

// Pre-save middleware to generate referral code
playerSchema.pre('save', function(next) {
  if (!this.referralCode) {
    this.referralCode = this.generateReferralCode();
  }
  next();
});

// Instance methods
playerSchema.methods.generateReferralCode = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `BINGO${result}`;
};

playerSchema.methods.addCoins = function(amount, reason = 'game_reward') {
  this.coins += amount;
  return this.save();
};

playerSchema.methods.deductCoins = function(amount, reason = 'game_entry') {
  if (this.coins < amount) {
    throw new Error('Insufficient coins');
  }
  this.coins -= amount;
  return this.save();
};

playerSchema.methods.updateStats = function(hasWon = false, bingos = 0) {
  this.totalGames += 1;
  if (hasWon) {
    this.gamesWon += 1;
  }
  if (bingos > 0) {
    this.totalBingos += bingos;
  }
  
  // Calculate experience and level up
  const expGained = hasWon ? 10 : 2;
  this.experience += expGained;
  
  // Level up every 100 experience points
  const newLevel = Math.floor(this.experience / 100) + 1;
  if (newLevel > this.level) {
    this.level = newLevel;
    // Award coins for level up
    this.coins += newLevel * 10;
  }
  
  return this.save();
};

playerSchema.methods.isInGame = function() {
  return !!this.currentGame;
};

// Static methods
playerSchema.statics.findByTelegramId = function(telegramId) {
  return this.findOne({ telegramId });
};

playerSchema.statics.findByUsername = function(username) {
  return this.findOne({ telegramUsername: username.toLowerCase() });
};

playerSchema.statics.getLeaderboard = function(limit = 10) {
  return this.find({ totalGames: { $gt: 0 } })
    .sort({ gamesWon: -1, totalGames: 1 })
    .limit(limit)
    .select('telegramUsername firstName lastName gamesWon totalGames winRate level coins');
};

playerSchema.statics.getOnlinePlayers = function() {
  return this.find({ isOnline: true })
    .select('telegramUsername firstName lastName level currentGame');
};

module.exports = mongoose.model('Player', playerSchema);
