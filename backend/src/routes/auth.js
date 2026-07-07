const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');

const MOCK = process.env.MOCK_MODE === 'true' || process.env.MOCK_MODE === '1' || process.env.MOCK_MODE === 'true';

function signToken(user) {
  return jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '7d' });
}

// Register (email + password)
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: 'User exists' });
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const user = await User.create({ email, password: hash, balance: 1000 });
    const token = signToken(user);
    res.json({ token, userId: user._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login (email + password)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken(user);
    res.json({ token, userId: user._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Request OTP (phone)
router.post('/request-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });
    let user = await User.findOne({ phone });
    if (!user) {
      user = await User.create({ phone, balance: 1000 });
    }
    const code = (Math.floor(100000 + Math.random() * 900000)).toString();
    const expires = new Date(Date.now() + 5 * 60000);
    user.otp = { code, expiresAt: expires, verified: false };
    await user.save();
    if (MOCK) {
      console.log(`[MOCK OTP] Phone ${phone} code=${code}`);
      return res.json({ mock: true, message: 'OTP sent (mock)' });
    }
    // TODO: integrate Twilio send
    res.json({ message: 'OTP sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { phone, code } = req.body;
    const user = await User.findOne({ phone });
    if (!user || !user.otp) return res.status(400).json({ error: 'No OTP for this user' });
    if (new Date() > new Date(user.otp.expiresAt)) return res.status(400).json({ error: 'OTP expired' });
    if (user.otp.code !== code) return res.status(400).json({ error: 'Invalid code' });
    user.otp.verified = true;
    await user.save();
    const token = signToken(user);
    res.json({ token, userId: user._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mock social login endpoints
router.post('/social/:provider', async (req, res) => {
  const { provider } = req.params;
  if (MOCK) {
    // create or find a fake user
    const id = crypto.createHash('sha256').update(provider + ':' + (req.body.id || crypto.randomBytes(6).toString('hex'))).digest('hex').slice(0, 12);
    const email = `${id}@mock.${provider}.local`;
    let user = await User.findOne({ email });
    if (!user) user = await User.create({ email, balance: 1000 });
    const token = signToken(user);
    return res.json({ token, userId: user._id, mock: true });
  }
  // In production, validate provider tokens (Google/Facebook) and create/find user
  res.status(501).json({ error: 'Social login not configured' });
});

module.exports = router;
