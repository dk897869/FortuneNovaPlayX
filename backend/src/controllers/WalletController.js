const Ledger = require('../models/Ledger');
const User = require('../models/User');

exports.getBalance = async (req, res) => {
  try {
    res.json({
      balance: req.user.balance,
      email: req.user.email
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalCount = await Ledger.countDocuments({ userId: req.user._id });
    const history = await Ledger.find({ userId: req.user._id })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      history,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      totalCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    // Top 10 users by balance (masking emails for privacy)
    const topBalancesRaw = await User.find({})
      .sort({ balance: -1 })
      .limit(10)
      .select('email balance');

    const topBalances = topBalancesRaw.map(u => ({
      username: u.email.split('@')[0],
      balance: u.balance
    }));

    // Top 10 single wins from the ledger (populating username from user email)
    const topWinsRaw = await Ledger.find({ type: 'win' })
      .sort({ amount: -1 })
      .limit(10)
      .populate('userId', 'email');

    const topWins = topWinsRaw.map(l => ({
      username: l.userId ? l.userId.email.split('@')[0] : 'Anonymous',
      amount: l.amount,
      game: l.game,
      timestamp: l.timestamp
    }));

    res.json({
      topBalances,
      topWins
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.claimDailyBonus = async (req, res) => {
  try {
    const userId = req.user._id;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const alreadyClaimed = await Ledger.findOne({
      userId,
      type: 'reward',
      game: 'daily_bonus',
      timestamp: { $gte: oneDayAgo }
    });

    if (alreadyClaimed) {
      return res.status(400).json({ error: 'Daily bonus already claimed within the last 24 hours. Come back tomorrow!' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.balance += 50.0;
    await user.save();

    const ledger = new Ledger({
      userId: user._id,
      amount: 50.0,
      type: 'reward',
      game: 'daily_bonus',
      resultingBalance: user.balance
    });
    await ledger.save();

    res.json({
      message: 'Daily bonus claimed successfully! +50.00 Coins credited to your wallet.',
      balance: user.balance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deposit = async (req, res) => {
  try {
    const { amount, method, details } = req.body;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      return res.status(400).json({ error: 'Invalid deposit amount.' });
    }
    if (!method || !details) {
      return res.status(400).json({ error: 'Deposit method and account details are required.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.balance += val;
    await user.save();

    const ledger = new Ledger({
      userId: user._id,
      amount: val,
      type: 'reward',
      game: 'deposit',
      resultingBalance: user.balance
    });
    await ledger.save();

    res.json({
      message: `Deposit of ${val.toFixed(2)} Coins processed successfully via ${method.toUpperCase()}!`,
      balance: user.balance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.withdraw = async (req, res) => {
  try {
    const { amount, method, details } = req.body;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount.' });
    }
    if (!method || !details) {
      return res.status(400).json({ error: 'Withdrawal method and target details are required.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (user.balance < val) {
      return res.status(400).json({ error: 'Insufficient balance to request withdrawal.' });
    }

    user.balance -= val;
    await user.save();

    const ledger = new Ledger({
      userId: user._id,
      amount: -val,
      type: 'cashout',
      game: 'withdrawal',
      resultingBalance: user.balance
    });
    await ledger.save();

    res.json({
      message: `Withdrawal request for ${val.toFixed(2)} Coins submitted successfully! Funds will be transferred via ${method.toUpperCase()} shortly.`,
      balance: user.balance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

