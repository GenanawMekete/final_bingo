const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Transaction Identification
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  reference: {
    type: String,
    unique: true,
    sparse: true
  },

  // Parties Involved
  player: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player',
    required: true
  },
  relatedGame: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Game'
  },
  relatedRoom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  },

  // Transaction Details
  type: {
    type: String,
    enum: [
      'game_win',
      'game_entry',
      'purchase',
      'refund',
      'bonus',
      'referral',
      'level_up',
      'admin_adjustment'
    ],
    required: true
  },
  category: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 1
  },
  currency: {
    type: String,
    default: 'coins'
  },

  // Balance Tracking
  balanceBefore: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },

  // Metadata
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed'
  },
  processedAt: {
    type: Date,
    default: Date.now
  },

  // Payment Gateway (for real money transactions)
  paymentGateway: {
    name: String,
    transactionId: String,
    payload: mongoose.Schema.Types.Mixed
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

// Indexes for efficient querying
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ player: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ category: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ player: 1, createdAt: -1 });
transactionSchema.index({ relatedGame: 1 });

// Virtual for net amount (positive for credit, negative for debit)
transactionSchema.virtual('netAmount').get(function() {
  return this.category === 'credit' ? this.amount : -this.amount;
});

// Instance Methods
transactionSchema.methods.complete = function() {
  this.status = 'completed';
  this.processedAt = new Date();
  return this.save();
};

transactionSchema.methods.fail = function(reason = '') {
  this.status = 'failed';
  if (reason) {
    this.metadata = this.metadata || new Map();
    this.metadata.set('failureReason', reason);
  }
  return this.save();
};

// Static Methods
transactionSchema.statics.createTransaction = async function(data) {
  const {
    player,
    type,
    category,
    amount,
    description,
    relatedGame = null,
    relatedRoom = null,
    metadata = {}
  } = data;

  // Get current player balance
  const Player = mongoose.model('Player');
  const playerDoc = await Player.findById(player);
  if (!playerDoc) {
    throw new Error('Player not found');
  }

  const balanceBefore = playerDoc.coins;
  let balanceAfter;

  // Calculate new balance
  if (category === 'credit') {
    balanceAfter = balanceBefore + amount;
  } else if (category === 'debit') {
    if (balanceBefore < amount) {
      throw new Error('Insufficient balance');
    }
    balanceAfter = balanceBefore - amount;
  }

  // Generate transaction ID
  const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const transaction = new this({
    transactionId,
    player,
    type,
    category,
    amount,
    currency: 'coins',
    balanceBefore,
    balanceAfter,
    description,
    relatedGame,
    relatedRoom,
    metadata: new Map(Object.entries(metadata)),
    status: 'pending'
  });

  // Update player balance
  playerDoc.coins = balanceAfter;
  await playerDoc.save();

  // Complete the transaction
  await transaction.complete();

  return transaction;
};

transactionSchema.statics.getPlayerTransactions = function(playerId, limit = 50, page = 1) {
  const skip = (page - 1) * limit;

  return this.find({ player: playerId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('relatedGame', 'gameId')
    .populate('relatedRoom', 'roomId name');
};

transactionSchema.statics.getPlayerBalance = async function(playerId) {
  const player = await mongoose.model('Player').findById(playerId).select('coins');
  return player ? player.coins : 0;
};

transactionSchema.statics.getPlayerStats = function(playerId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return this.aggregate([
    {
      $match: {
        player: mongoose.Types.ObjectId(playerId),
        createdAt: { $gte: startDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: {
          type: '$type',
          category: '$category'
        },
        totalAmount: { $sum: '$amount' },
        transactionCount: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.type',
        credits: {
          $sum: {
            $cond: [{ $eq: ['$_id.category', 'credit'] }, '$totalAmount', 0]
          }
        },
        debits: {
          $sum: {
            $cond: [{ $eq: ['$_id.category', 'debit'] }, '$totalAmount', 0]
          }
        },
        creditCount: {
          $sum: {
            $cond: [{ $eq: ['$_id.category', 'credit'] }, '$transactionCount', 0]
          }
        },
        debitCount: {
          $sum: {
            $cond: [{ $eq: ['$_id.category', 'debit'] }, '$transactionCount', 0]
          }
        }
      }
    },
    {
      $project: {
        type: '$_id',
        netAmount: { $subtract: ['$credits', '$debits'] },
        credits: 1,
        debits: 1,
        creditCount: 1,
        debitCount: 1,
        _id: 0
      }
    }
  ]);
};

// Pre-save middleware
transactionSchema.pre('save', function(next) {
  if (!this.transactionId) {
    this.transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
