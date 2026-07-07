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

