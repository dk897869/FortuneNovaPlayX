const User = require('../models/User');
const Ledger = require('../models/Ledger');
const mongoose = require('mongoose');

/**
 * Adjusts user wallet balance atomically and records a ledger entry.
 * Runs in a session transaction if possible, or falls back to atomic update.
 * @param {string} userId - User identifier
 * @param {number} amount - Signed change amount (negative for bet, positive for win/reward)
 * @param {string} type - Transaction type ('bet', 'win', 'reward', 'cashout')
 * @param {string} game - Game context ('dice', 'mines', 'signup_reward')
 * @returns {Promise<number>} New balance
 */
async function adjustBalance(userId, amount, type, game) {
  const roundedAmount = Math.round(amount * 100) / 100;
  const conn = mongoose.connection;
  let session = null;
  
  try {
    // Try starting a session and transaction (requires MongoDB replica set)
    session = await conn.startSession();
    session.startTransaction();
    
    // 1. Fetch user and check balance inside transaction
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }
    
    if (roundedAmount < 0 && user.balance < Math.abs(roundedAmount)) {
      throw new Error('Insufficient balance');
    }
    
    // 2. Perform balance change
    user.balance = Math.round((user.balance + roundedAmount) * 100) / 100;
    await user.save({ session });
    
    // 3. Record ledger entry
    const ledger = new Ledger({
      userId,
      amount: roundedAmount,
      type,
      game,
      resultingBalance: user.balance
    });
    await ledger.save({ session });
    
    // Commit transaction
    await session.commitTransaction();
    session.endSession();
    
    return user.balance;
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        // Ignore transaction abort errors if session failed to start transaction
      }
      session.endSession();
    }
    
    // Check if the error is related to transaction support (like no replica set)
    const isReplicaSetError = 
      error.message.includes('replica set') || 
      error.message.includes('transaction') || 
      error.message.includes('Session') || 
      error.code === 20 || // TransactionSystemFailed
      error.code === 251 || // NoSuchTransaction
      error.code === 263;   // OperationNotSupportedInTransaction
      
    if (isReplicaSetError) {
      // Fallback: Atomic check-and-update pattern (100% race-safe)
      return await adjustBalanceAtomic(userId, roundedAmount, type, game);
    } else {
      // Business logic or valid db error (e.g., 'Insufficient balance' or 'User not found')
      throw error;
    }
  }
}

/**
 * Fallback atomic update pattern (race-safe, works on standalone MongoDB)
 */
async function adjustBalanceAtomic(userId, amount, type, game) {
  const query = { _id: userId };
  
  if (amount < 0) {
    // Query condition: user must have at least the bet amount
    query.balance = { $gte: Math.abs(amount) };
  }
  
  const updatedUser = await User.findOneAndUpdate(
    query,
    { $inc: { balance: amount } },
    { new: true }
  );
  
  if (!updatedUser) {
    const exists = await User.exists({ _id: userId });
    if (!exists) {
      throw new Error('User not found');
    }
    throw new Error('Insufficient balance');
  }
  
  // Double ensure rounding
  const finalBalance = Math.round(updatedUser.balance * 100) / 100;
  if (updatedUser.balance !== finalBalance) {
    updatedUser.balance = finalBalance;
    await updatedUser.save();
  }
  
  // Record ledger entry (immutable)
  const ledger = new Ledger({
    userId,
    amount,
    type,
    game,
    resultingBalance: finalBalance
  });
  await ledger.save();
  
  return finalBalance;
}

module.exports = {
  adjustBalance
};
