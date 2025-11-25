const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    trim: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  languageCode: {
    type: String,
    default: 'en'
  },
  avatar: {
    type: String
  },
  balance: {
    type: Number,
    default: 1000,
    min: 0
  },
  level: {
    type: Number,
    default: 1
  },
  experience: {
    type: Number,
    default: 0
  },
  gamesPlayed: {
    type: Number,
    default: 0
  },
  gamesWon: {
    type: Number,
    default: 0
  },
  totalWinnings: {
    type: Number,
    default: 0
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  achievements: [{
    achievementId: String,
    name: String,
    description: String,
    unlockedAt: {
      type: Date,
      default: Date.now
    },
    icon: String
  }],
  settings: {
    soundEnabled: {
      type: Boolean,
      default: true
    },
    notificationsEnabled: {
      type: Boolean,
      default: true
    },
    autoMarkEnabled: {
      type: Boolean,
      default: true
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto'
    }
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  referralCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for better performance
userSchema.index({ telegramId: 1 });
userSchema.index({ balance: -1 });
userSchema.index({ gamesWon: -1 });
userSchema.index({ level: -1 });
userSchema.index({ referralCode: 1 });

// Virtual for win rate
userSchema.virtual('winRate').get(function() {
  return this.gamesPlayed > 0 ? (this.gamesWon / this.gamesPlayed * 100).toFixed(1) : 0;
});

// Methods
userSchema.methods.addExperience = function(exp) {
  this.experience += exp;
  const expForNextLevel = this.level * 100;
  if (this.experience >= expForNextLevel) {
    this.level += 1;
    this.experience -= expForNextLevel;
    return true; // Level up
  }
  return false; // No level up
};

userSchema.methods.updateStats = function(hasWon, winnings = 0) {
  this.gamesPlayed += 1;
  
  if (hasWon) {
    this.gamesWon += 1;
    this.totalWinnings += winnings;
    this.balance += winnings;
    this.currentStreak += 1;
    
    if (this.currentStreak > this.longestStreak) {
      this.longestStreak = this.currentStreak;
    }
  } else {
    this.currentStreak = 0;
  }
  
  // Add experience for playing
  const expGained = hasWon ? 25 : 10;
  const leveledUp = this.addExperience(expGained);
  
  this.lastActive = new Date();
  
  return leveledUp;
};

userSchema.methods.canAfford = function(amount) {
  return this.balance >= amount;
};

userSchema.methods.deductBalance = function(amount) {
  if (!this.canAfford(amount)) {
    throw new Error('Insufficient balance');
  }
  this.balance -= amount;
  return this.balance;
};

userSchema.methods.addBalance = function(amount) {
  this.balance += amount;
  return this.balance;
};

// Static methods
userSchema.statics.findByTelegramId = function(telegramId) {
  return this.findOne({ telegramId });
};

userSchema.statics.getLeaderboard = function(limit = 100) {
  return this.find({ isActive: true })
    .sort({ gamesWon: -1, balance: -1 })
    .limit(limit)
    .select('telegramId firstName username level gamesPlayed gamesWon totalWinnings balance');
};

userSchema.statics.getTopPlayers = function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ balance: -1 })
    .limit(limit)
    .select('telegramId firstName username balance level');
};

// Pre-save middleware
userSchema.pre('save', function(next) {
  // Generate referral code if not exists
  if (!this.referralCode) {
    this.referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
