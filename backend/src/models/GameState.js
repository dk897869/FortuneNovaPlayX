const mongoose = require('mongoose');

const GameStateSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  gameType: {
    type: String,
    required: true,
    enum: ['mines', 'dice', 'ludo']
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'completed'],
    default: 'active'
  },
  betAmount: {
    type: Number,
    required: true
  },
  mineCount: {
    type: Number,
    // Optional, specific to Mines
    default: null
  },
  state: {
    // For Mines: { minePositions: [Number], revealedCells: [Number], currentMultiplier: Number }
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  serverSeed: {
    type: String,
    required: true
  },
  serverSeedHash: {
    type: String,
    required: true
  },
  clientSeed: {
    type: String,
    required: true
  },
  nonce: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GameState', GameStateSchema);
