const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Ledger = require('../models/Ledger');

// Simple auth middleware (expects Authorization: Bearer <token>)
const jwt = require('jsonwebtoken');
function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'Missing auth' });
  const parts = h.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'Invalid auth' });
  try {
    const payload = jwt.verify(parts[1], process.env.JWT_SECRET || 'devsecret');
    req.userId = payload.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Place a bet: deduct balance atomically and create ledger entry
router.post('/bet', authMiddleware, async (req, res) => {
  const { amount, game = 'dice' } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  const userId = req.userId;

  // Attempt using MongoDB transactions (replica set required)
  const session = await mongoose.startSession();
  let usedTxn = false;
  try {
    await session.withTransaction(async () => {
      usedTxn = true;
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error('User not found');
      if (user.balance < amount) throw new Error('Insufficient funds');
      user.balance -= amount;
      await user.save({ session });
      await Ledger.create([{ userId, amount: -Math.abs(amount), type: 'bet', game, resultingBalance: user.balance }], { session });
    });
    if (usedTxn) return res.json({ ok: true, txn: true });
  } catch (err) {
    // If transactions are not supported or fail, fallback to atomic update
    console.warn('Transaction failed or unavailable, falling back:', err.message);
  } finally {
    session.endSession();
  }

  // Fallback: atomic findOneAndUpdate with balance check
  try {
    const updated = await User.findOneAndUpdate(
      { _id: userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true }
    );
    if (!updated) return res.status(400).json({ error: 'Insufficient funds or user not found' });
    await Ledger.create({ userId, amount: -Math.abs(amount), type: 'bet', game, resultingBalance: updated.balance });
    return res.json({ ok: true, txn: false, balance: updated.balance });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Simple credit endpoint for testing (admins)
router.post('/credit', async (req, res) => {
  const { userId, amount, game = 'other' } = req.body;
  if (!userId || !amount) return res.status(400).json({ error: 'userId and amount required' });
  try {
    const updated = await User.findByIdAndUpdate(userId, { $inc: { balance: amount } }, { new: true });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    await Ledger.create({ userId, amount: Math.abs(amount), type: 'reward', game, resultingBalance: updated.balance });
    res.json({ ok: true, balance: updated.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
