const GameState = require('../models/GameState');
const Ledger = require('../models/Ledger');
const WalletService = require('../services/WalletService');
const FairnessService = require('../services/FairnessService');

// Dice Game
exports.rollDice = async (req, res) => {
  try {
    const { betAmount, target, condition, clientSeed: customClientSeed } = req.body;
    
    // 1. Input validations
    const bet = parseFloat(betAmount);
    const tgt = parseFloat(target);
    
    if (isNaN(bet) || bet <= 0) {
      return res.status(400).json({ error: 'Bet amount must be a positive number.' });
    }
    if (isNaN(tgt)) {
      return res.status(400).json({ error: 'Target must be a number.' });
    }
    if (condition !== 'over' && condition !== 'under') {
      return res.status(400).json({ error: 'Condition must be either over or under.' });
    }
    
    // Bounds validation to keep win chance in safe limits [1%, 98%]
    if (condition === 'over' && (tgt < 1.00 || tgt > 98.00)) {
      return res.status(400).json({ error: 'For over, target must be between 1.00 and 98.00.' });
    }
    if (condition === 'under' && (tgt < 2.00 || tgt > 99.00)) {
      return res.status(400).json({ error: 'For under, target must be between 2.00 and 99.00.' });
    }

    const userId = req.user._id;
    
    // 2. Compute win chance & payout multiplier (1% house edge => 99 / winChance)
    let winChance = 0;
    if (condition === 'over') {
      winChance = 99.99 - tgt;
    } else {
      winChance = tgt;
    }
    const multiplier = 99.0 / winChance;
    
    // 3. Deduct bet amount (will throw if insufficient balance)
    let newBalance;
    try {
      newBalance = await WalletService.adjustBalance(userId, -bet, 'bet', 'dice');
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    
    // 4. Provably Fair roll outcome generation
    const clientSeed = customClientSeed || Math.random().toString(36).substring(2, 10);
    const diceBetCount = await Ledger.countDocuments({ userId, game: 'dice', type: 'bet' });
    const nonce = diceBetCount + 1;
    
    const serverSeed = FairnessService.generateServerSeed();
    const serverSeedHash = FairnessService.hashSeed(serverSeed);
    
    const roll = FairnessService.getDiceRoll(serverSeed, clientSeed, nonce);
    
    // 5. Check outcome
    let won = false;
    if (condition === 'over') {
      won = roll > tgt;
    } else {
      won = roll < tgt;
    }
    
    let payout = 0;
    if (won) {
      payout = Math.round(bet * multiplier * 100) / 100;
      // Credit winnings
      newBalance = await WalletService.adjustBalance(userId, payout, 'win', 'dice');
    }
    
    res.json({
      roll,
      won,
      payout,
      newBalance,
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce,
      winChance,
      multiplier
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Start Mines Game
exports.startMines = async (req, res) => {
  try {
    const { betAmount, mineCount, clientSeed: customClientSeed } = req.body;
    
    const bet = parseFloat(betAmount);
    const mines = parseInt(mineCount);
    
    if (isNaN(bet) || bet <= 0) {
      return res.status(400).json({ error: 'Bet amount must be a positive number.' });
    }
    if (isNaN(mines) || mines < 1 || mines > 24) {
      return res.status(400).json({ error: 'Mine count must be between 1 and 24.' });
    }

    const userId = req.user._id;

    // Resume check: if user already has an active game, return it
    const activeGame = await GameState.findOne({ userId, gameType: 'mines', status: 'active' });
    if (activeGame) {
      return res.json({
        message: 'Resuming active game.',
        gameId: activeGame._id,
        serverSeedHash: activeGame.serverSeedHash,
        nonce: activeGame.nonce,
        mineCount: activeGame.mineCount,
        betAmount: activeGame.betAmount,
        revealedCells: activeGame.state.revealedCells,
        currentMultiplier: activeGame.state.currentMultiplier,
        isResumed: true
      });
    }

    // Deduct bet amount (throws error if insufficient balance)
    let newBalance;
    try {
      newBalance = await WalletService.adjustBalance(userId, -bet, 'bet', 'mines');
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    // Generate Provably Fair seeds
    const clientSeed = customClientSeed || Math.random().toString(36).substring(2, 10);
    const minesGameCount = await GameState.countDocuments({ userId, gameType: 'mines' });
    const nonce = minesGameCount + 1;
    
    const serverSeed = FairnessService.generateServerSeed();
    const serverSeedHash = FairnessService.hashSeed(serverSeed);
    
    // Generate mine locations
    const minePositions = FairnessService.getMinesPositions(serverSeed, clientSeed, nonce, mines);

    const gameState = new GameState({
      userId,
      gameType: 'mines',
      status: 'active',
      betAmount: bet,
      mineCount: mines,
      state: {
        minePositions,
        revealedCells: [],
        currentMultiplier: 1.0
      },
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce
    });

    await gameState.save();

    res.status(201).json({
      gameId: gameState._id,
      serverSeedHash,
      nonce,
      mineCount: mines,
      betAmount: bet,
      newBalance,
      revealedCells: [],
      currentMultiplier: 1.0,
      isResumed: false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Reveal Cell helper for Mines multiplier
function calculateMinesMultiplier(totalCells, mineCount, revealedCount) {
  let p = 1.0;
  for (let i = 0; i < revealedCount; i++) {
    p *= (totalCells - mineCount - i) / (totalCells - i);
  }
  // 1% House edge => returns multiplier
  const mult = 0.99 / p;
  return Math.round(mult * 100) / 100;
}

// Reveal Cell
exports.revealCell = async (req, res) => {
  try {
    const { gameId, cellIndex } = req.body;
    const cellIdx = parseInt(cellIndex);
    
    if (isNaN(cellIdx) || cellIdx < 0 || cellIdx > 24) {
      return res.status(400).json({ error: 'Cell index must be between 0 and 24.' });
    }

    const gameState = await GameState.findOne({ _id: gameId, userId: req.user._id, status: 'active' });
    if (!gameState) {
      return res.status(404).json({ error: 'No active Mines game found.' });
    }

    const { minePositions, revealedCells } = gameState.state;

    if (revealedCells.includes(cellIdx)) {
      return res.status(400).json({ error: 'Cell is already revealed.' });
    }

    // Check if cell is a mine
    const hitMine = minePositions.includes(cellIdx);
    
    if (hitMine) {
      // Game Over: User loses
      gameState.status = 'completed';
      gameState.state.currentMultiplier = 0.0;
      await gameState.save();
      
      return res.json({
        hitMine: true,
        minePositions,
        serverSeed: gameState.serverSeed,
        currentMultiplier: 0.0,
        revealedCells: [...revealedCells, cellIdx]
      });
    }

    // Safe cell revealed
    revealedCells.push(cellIdx);
    
    // Calculate new multiplier
    const totalSafeCells = 25 - gameState.mineCount;
    const newMultiplier = calculateMinesMultiplier(25, gameState.mineCount, revealedCells.length);
    gameState.state.currentMultiplier = newMultiplier;
    
    // Auto-cashout if all safe cells are revealed
    if (revealedCells.length === totalSafeCells) {
      gameState.status = 'completed';
      await gameState.save();
      
      const payout = Math.round(gameState.betAmount * newMultiplier * 100) / 100;
      const newBalance = await WalletService.adjustBalance(req.user._id, payout, 'win', 'mines');
      
      return res.json({
        hitMine: false,
        revealedCells,
        currentMultiplier: newMultiplier,
        isCompleted: true,
        minePositions,
        serverSeed: gameState.serverSeed,
        payout,
        newBalance
      });
    }

    // Update state and continue
    gameState.markModified('state');
    await gameState.save();

    res.json({
      hitMine: false,
      revealedCells,
      currentMultiplier: newMultiplier,
      isCompleted: false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Cashout Mines
exports.cashoutMines = async (req, res) => {
  try {
    const { gameId } = req.body;
    const gameState = await GameState.findOne({ _id: gameId, userId: req.user._id, status: 'active' });
    
    if (!gameState) {
      return res.status(404).json({ error: 'No active Mines game found.' });
    }

    const { revealedCells, currentMultiplier, minePositions } = gameState.state;

    if (revealedCells.length === 0) {
      return res.status(400).json({ error: 'Cannot cash out with zero revealed tiles.' });
    }

    gameState.status = 'completed';
    await gameState.save();

    const payout = Math.round(gameState.betAmount * currentMultiplier * 100) / 100;
    const newBalance = await WalletService.adjustBalance(req.user._id, payout, 'win', 'mines');

    res.json({
      success: true,
      payout,
      newBalance,
      minePositions,
      serverSeed: gameState.serverSeed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Start Ludo (Casino Quick Run)
exports.startLudo = async (req, res) => {
  try {
    const { betAmount, clientSeed: customClientSeed } = req.body;
    const bet = parseFloat(betAmount);

    if (isNaN(bet) || bet <= 0) {
      return res.status(400).json({ error: 'Bet amount must be a positive number.' });
    }

    const userId = req.user._id;

    // Terminate any existing active ludo game for this user
    await GameState.updateMany(
      { userId, gameType: 'ludo', status: 'active' },
      { $set: { status: 'completed' } }
    );

    // Deduct bet amount
    let newBalance;
    try {
      newBalance = await WalletService.adjustBalance(userId, -bet, 'bet', 'ludo');
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const clientSeed = customClientSeed || Math.random().toString(36).substring(2, 10);
    const ludoGameCount = await GameState.countDocuments({ userId, gameType: 'ludo' });
    const nonce = ludoGameCount + 1;

    const serverSeed = FairnessService.generateServerSeed();
    const serverSeedHash = FairnessService.hashSeed(serverSeed);

    const gameState = new GameState({
      userId,
      gameType: 'ludo',
      status: 'active',
      betAmount: bet,
      state: {
        position: 0,
        currentMultiplier: 1.00,
        rolls: []
      },
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce
    });

    await gameState.save();

    res.status(201).json({
      gameId: gameState._id,
      serverSeedHash,
      nonce,
      betAmount: bet,
      newBalance,
      position: 0,
      currentMultiplier: 1.00
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Roll Die in Ludo
exports.rollLudo = async (req, res) => {
  try {
    const { gameId } = req.body;
    const gameState = await GameState.findOne({ _id: gameId, userId: req.user._id, status: 'active' });

    if (!gameState) {
      return res.status(404).json({ error: 'No active Ludo game found.' });
    }

    const userId = req.user._id;
    // We increment step nonce by the length of rolls taken in this round to keep every roll distinct and provably fair
    const rollNonce = gameState.nonce * 100 + gameState.state.rolls.length;
    
    // Provably fair roll calculation
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', gameState.serverSeed);
    hmac.update(`${gameState.clientSeed}-${rollNonce}`);
    const hash = hmac.digest('hex');
    const subHash = hash.substring(0, 8);
    const val = parseInt(subHash, 16);
    
    const roll = (val % 6) + 1; // 1 to 6
    const oldPosition = gameState.state.position;
    let newPosition = oldPosition + roll;
    
    let isCompleted = false;
    let hitDanger = false;
    let currentMultiplier = gameState.state.currentMultiplier;
    let message = `You rolled a ${roll} and moved to cell ${newPosition}.`;

    if (newPosition >= 15) {
      newPosition = 15;
      isCompleted = true;
      currentMultiplier = 8.00; // 8x payout for reaching home
      message = `Home Run! You reached the center home tile and won x${currentMultiplier}!`;
    } else {
      // Check tile types
      if (newPosition === 6) {
        // Danger zone 1 (35% risk)
        const riskVal = val % 100;
        if (riskVal < 35) {
          isCompleted = true;
          hitDanger = true;
          currentMultiplier = 0;
          message = `Captured! Opponent token cut you at cell 6. Better luck next time!`;
        } else {
          currentMultiplier = 1.80;
          message = `Safe! You dodged the opponent at cell 6. Current Multiplier: x${currentMultiplier}`;
        }
      } else if (newPosition === 11) {
        // Danger zone 2 (40% risk)
        const riskVal = val % 100;
        if (riskVal < 40) {
          isCompleted = true;
          hitDanger = true;
          currentMultiplier = 0;
          message = `Captured! Opponent token cut you at cell 11. Better luck next time!`;
        } else {
          currentMultiplier = 3.20;
          message = `Safe! You dodged the opponent at cell 11. Current Multiplier: x${currentMultiplier}`;
        }
      } else if (newPosition === 3) {
        currentMultiplier = 1.30; // Star tile
        message = `Star safe zone! Landed on safe cell 3. Multiplier: x${currentMultiplier}`;
      } else if (newPosition === 8) {
        currentMultiplier = 2.20; // Star tile
        message = `Star safe zone! Landed on safe cell 8. Multiplier: x${currentMultiplier}`;
      } else if (newPosition === 13) {
        currentMultiplier = 4.00; // Star tile
        message = `Star safe zone! Landed on safe cell 13. Multiplier: x${currentMultiplier}`;
      } else {
        // Normal tile
        currentMultiplier = Math.round((1.0 + newPosition * 0.1) * 100) / 100;
      }
    }

    // Save history
    gameState.state.rolls.push({ roll, from: oldPosition, to: newPosition, multiplier: currentMultiplier });
    gameState.state.position = newPosition;
    gameState.state.currentMultiplier = currentMultiplier;

    let payout = 0;
    let newBalance = req.user.balance;

    if (isCompleted) {
      gameState.status = 'completed';
      if (!hitDanger && currentMultiplier > 0) {
        // Won the whole board!
        payout = Math.round(gameState.betAmount * currentMultiplier * 100) / 100;
        newBalance = await WalletService.adjustBalance(userId, payout, 'win', 'ludo');
      }
    }

    await gameState.save();

    res.json({
      roll,
      position: newPosition,
      currentMultiplier,
      isCompleted,
      hitDanger,
      message,
      payout,
      newBalance,
      serverSeed: isCompleted ? gameState.serverSeed : undefined
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Cashout Ludo
exports.cashoutLudo = async (req, res) => {
  try {
    const { gameId } = req.body;
    const gameState = await GameState.findOne({ _id: gameId, userId: req.user._id, status: 'active' });

    if (!gameState) {
      return res.status(404).json({ error: 'No active Ludo game found.' });
    }

    const currentMultiplier = gameState.state.currentMultiplier;

    gameState.status = 'completed';
    await gameState.save();

    const payout = Math.round(gameState.betAmount * currentMultiplier * 100) / 100;
    const newBalance = await WalletService.adjustBalance(req.user._id, payout, 'win', 'ludo');

    res.json({
      success: true,
      payout,
      newBalance,
      serverSeed: gameState.serverSeed,
      finalMultiplier: currentMultiplier
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
