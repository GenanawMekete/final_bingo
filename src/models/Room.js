const mongoose = require('mongoose');
const { GAME_CONSTANTS } = require('../config/constants');

const roomSchema = new mongoose.Schema({
  // Room Identification
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200
  },

  // Room Configuration
  config: {
    type: {
      type: String,
      enum: ['public', 'private', 'tournament'],
      default: 'public'
    },
    maxPlayers: {
      type: Number,
      default: GAME_CONSTANTS.game.maxPlayers,
      min: 2,
      max: 500
    },
    entryFee: {
      type: Number,
      default: 0,
      min: 0
    },
    prizePool: {
      type: Number,
      default: 0
    },
    gameDuration: {
      type: Number,
      default: GAME_CONSTANTS.TIMERS.GAME
    },
    autoStart: {
      type: Boolean,
      default: true
    },
    minPlayersToStart: {
      type: Number,
      default: GAME_CONSTANTS.game.minPlayers
    }
  },

  // Room State
  status: {
    type: String,
    enum: ['waiting', 'starting', 'in_game', 'finished', 'closed'],
    default: 'waiting'
  },
  currentGame: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game'
  },
  players: [{
    player: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
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
    isHost: {
      type: Boolean,
      default: false
    }
  }],

  // Room Statistics
  stats: {
    totalGames: {
      type: Number,
      default: 0
    },
    activePlayers: {
      type: Number,
      default: 0
    },
    totalWinners: {
      type: Number,
      default: 0
    },
    totalPrize: {
      type: Number,
      default: 0
    }
  },

  // Access Control
  password: String,
  allowedPlayers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }],
  bannedPlayers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }],

  // Tournament Settings (if applicable)
  tournament: {
    isTournament: {
      type: Boolean,
      default: false
    },
    maxRounds: Number,
    currentRound: {
      type: Number,
      default: 1
    },
    winners: [{
      player: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player'
      },
      round: Number,
      position: Number,
      prize: Number
    }]
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.password;
      return ret;
    }
  }
});

// Indexes
roomSchema.index({ roomId: 1 });
roomSchema.index({ status: 1 });
roomSchema.index({ 'config.type': 1 });
roomSchema.index({ createdAt: 1 });
roomSchema.index({ lastActivity: 1 });

// Virtuals
roomSchema.virtual('playerCount').get(function() {
  return this.players.length;
});

roomSchema.virtual('isFull').get(function() {
  return this.players.length >= this.config.maxPlayers;
});

roomSchema.virtual('canStart').get(function() {
  return this.players.length >= this.config.minPlayersToStart && 
         this.status === 'waiting';
});

roomSchema.virtual('availableSpots').get(function() {
  return this.config.maxPlayers - this.players.length;
});

// Instance Methods
roomSchema.methods.addPlayer = function(playerId, isHost = false) {
  if (this.isFull) {
    throw new Error('Room is full');
  }

  if (this.status !== 'waiting') {
    throw new Error('Room is not accepting players');
  }

  // Check if player is banned
  if (this.bannedPlayers.some(bp => bp.toString() === playerId.toString())) {
    throw new Error('Player is banned from this room');
  }

  // Check if player already in room
  const existingPlayer = this.players.find(p => p.player.toString() === playerId.toString());
  if (existingPlayer) {
    throw new Error('Player already in room');
  }

  this.players.push({
    player: playerId,
    joinedAt: new Date(),
    isHost
  });

  this.stats.activePlayers = this.players.length;
  this.lastActivity = new Date();

  return this.save();
};

roomSchema.methods.removePlayer = function(playerId) {
  const playerIndex = this.players.findIndex(p => p.player.toString() === playerId.toString());
  
  if (playerIndex === -1) {
    throw new Error('Player not found in room');
  }

  const wasHost = this.players[playerIndex].isHost;
  this.players.splice(playerIndex, 1);
  this.stats.activePlayers = this.players.length;
  this.lastActivity = new Date();

  // If host left, assign new host
  if (wasHost && this.players.length > 0) {
    this.players[0].isHost = true;
  }

  return this.save();
};

roomSchema.methods.startGame = function() {
  if (this.status !== 'waiting') {
    throw new Error('Room is not in waiting state');
  }

  if (!this.canStart) {
    throw new Error('Not enough players to start game');
  }

  this.status = 'starting';
  this.lastActivity = new Date();

  return this.save();
};

roomSchema.methods.completeGame = function() {
  this.status = 'waiting';
  this.currentGame = null;
  this.stats.totalGames += 1;
  this.lastActivity = new Date();

  return this.save();
};

roomSchema.methods.closeRoom = function() {
  this.status = 'closed';
  this.lastActivity = new Date();

  return this.save();
};

// Static Methods
roomSchema.statics.findPublicRooms = function() {
  return this.find({
    'config.type': 'public',
    status: 'waiting'
  })
  .populate('players.player', 'telegramUsername firstName lastName level')
  .sort({ 'stats.activePlayers': -1, createdAt: -1 });
};

roomSchema.statics.findByPlayer = function(playerId) {
  return this.findOne({
    'players.player': playerId,
    status: { $in: ['waiting', 'starting', 'in_game'] }
  });
};

roomSchema.statics.createPublicRoom = function(name, description = '') {
  const roomId = `ROOM_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  return new this({
    roomId,
    name,
    description,
    config: {
      type: 'public'
    }
  });
};

roomSchema.statics.createPrivateRoom = function(name, password, creatorId) {
  const roomId = `PRIVATE_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  const room = new this({
    roomId,
    name,
    config: {
      type: 'private'
    },
    password
  });

  return room.addPlayer(creatorId, true);
};

// Pre-save middleware to generate room ID if not provided
roomSchema.pre('save', function(next) {
  if (!this.roomId) {
    this.roomId = `ROOM_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }
  next();
});

module.exports = mongoose.model('Room', roomSchema);
