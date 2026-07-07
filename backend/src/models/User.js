const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    // Optional if logged in via Social OAuth
    required: function() {
      return !this.googleId && !this.facebookId;
    }
  },
  phone: {
    type: String,
    default: ''
  },
  otp: {
    code: { type: String, default: null },
    expiresAt: { type: Date, default: null },
    verified: { type: Boolean, default: false }
  },
  balance: {
    type: Number,
    required: true,
    default: 1000.0 // seeded with 1000 Game Coins
  },
  googleId: {
    type: String,
    default: null
  },
  facebookId: {
    type: String,
    default: null
  },
  avatar: {
    type: String,
    default: 'avatar-ninja'
  },
  verificationToken: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
