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
    verified: { type: Boolean, default: true }
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
  },
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

UserSchema.pre('save', function(next) {
  if (!this.referralCode) {
    this.referralCode = 'REF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('User', UserSchema);
