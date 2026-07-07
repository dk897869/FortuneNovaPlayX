const mongoose = require('mongoose');

const LedgerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true // Positive for wins/rewards, negative for bets
  },
  type: {
    type: String,
    required: true,
    enum: ['bet', 'win', 'reward', 'cashout']
  },
  game: {
    type: String,
    required: true,
    enum: ['dice', 'mines', 'signup_reward', 'ludo', 'deposit', 'withdrawal', 'daily_bonus', 'referral_reward']
  },
  resultingBalance: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  }
});

// Enforce ledger immutability on update/delete triggers
LedgerSchema.pre('validate', function(next) {
  if (!this.isNew) {
    return next(new Error('Cannot modify or delete an immutable ledger entry.'));
  }
  next();
});

module.exports = mongoose.model('Ledger', LedgerSchema);
