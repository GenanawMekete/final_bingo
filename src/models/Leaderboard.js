const mongoose = require('mongoose');

const leaderboardSchema = new mongoose.Schema({
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'alltime'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date
  },
  rankings: [{
    rank: {
      type: Number,
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    score: {
      type: Number,
      required: true
    },
    gamesWon: {
      type: Number,
      default: 0
    },
    totalWinnings: {
      type: Number,
      default: 0
    },
    winRate: {
      type: Number,
      default: 0
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
leaderboardSchema.index({ period: 1, startDate: -1 });
leaderboardSchema.index({ isActive: 1 });

// Static methods
leaderboardSchema.statics.updateLeaderboard = async function(period = 'daily') {
  const startDate = this.getPeriodStartDate(period);
  const endDate = this.getPeriodEndDate(period);
  
  // Deactivate current leaderboard for this period
  await this.updateMany(
    { period, isActive: true },
    { isActive: false }
  );
  
  // Get top players for the period
  const Game = mongoose.model('Game');
  const topPlayers = await Game.aggregate([
    {
      $match: {
        endedAt: { $gte: startDate, $lte: endDate },
        status: 'ended',
        winner: { $exists: true }
      }
    },
    {
      $unwind: '$players'
    },
    {
      $match: {
        'players.hasClaimedBingo': true
      }
    },
    {
      $group: {
        _id: '$players.user',
        gamesWon: { $sum: 1 },
        totalWinnings: { $sum: '$players.winnings' },
        totalGames: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $project: {
        _id: 1,
        gamesWon: 1,
        totalWinnings: 1,
        winRate: {
          $cond: [
            { $gt: ['$totalGames', 0] },
            { $multiply: [{ $divide: ['$gamesWon', '$totalGames'] }, 100] },
            0
          ]
        },
        score: {
          $add: [
            { $multiply: ['$gamesWon', 100] },
            { $multiply: ['$totalWinnings', 0.1] },
            { $multiply: ['$winRate', 10] }
          ]
        }
      }
    },
    {
      $sort: { score: -1 }
    },
    {
      $limit: 100
    }
  ]);
  
  // Create rankings
  const rankings = topPlayers.map((player, index) => ({
    rank: index + 1,
    user: player._id,
    score: player.score,
    gamesWon: player.gamesWon,
    totalWinnings: player.totalWinnings,
    winRate: player.winRate
  }));
  
  // Create new leaderboard
  const leaderboard = new this({
    period,
    startDate,
    endDate,
    rankings,
    isActive: true
  });
  
  await leaderboard.save();
  return leaderboard;
};

leaderboardSchema.statics.getPeriodStartDate = function(period) {
  const now = new Date();
  
  switch (period) {
    case 'daily':
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'weekly':
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(now.setDate(diff));
    case 'monthly':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'alltime':
      return new Date(0); // Beginning of time
    default:
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
};

leaderboardSchema.statics.getPeriodEndDate = function(period) {
  const startDate = this.getPeriodStartDate(period);
  
  switch (period) {
    case 'daily':
      return new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
    case 'weekly':
      return new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'monthly':
      return new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
    case 'alltime':
      return new Date(); // Current time
    default:
      return new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
  }
};

leaderboardSchema.statics.getCurrentLeaderboard = function(period = 'daily') {
  return this.findOne({ period, isActive: true })
    .populate('rankings.user', 'telegramId firstName username avatar level')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('Leaderboard', leaderboardSchema);
