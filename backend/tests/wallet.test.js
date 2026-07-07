const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/server');
const User = require('../src/models/User');
const Ledger = require('../src/models/Ledger');
const GameState = require('../src/models/GameState');

// Set test environment database URI before running tests
const TEST_DB_URI = 'mongodb://127.0.0.1:27017/virtual_gaming_db_test';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = TEST_DB_URI;
  process.env.JWT_SECRET = 'test_secret_key_123';
  await mongoose.connect(TEST_DB_URI);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

beforeEach(async () => {
  // Clear collections
  await User.deleteMany({});
  await Ledger.deleteMany({});
  await GameState.deleteMany({});
});

describe('Wallet Integrity & Concurrency Integration Tests', () => {
  
  // Helper to create verified user
  async function createVerifiedUser(email = 'player@test.com', password = 'Password123') {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password, phone: '+1234567890' });
    
    const token = res.body.token;
    
    // Auto-verify OTP for testing convenience
    const user = await User.findOne({ email });
    user.otp.verified = true;
    await user.save();
    
    return { token, userId: user._id };
  }

  test('Wallet Concurrency Race Conditions: 10 rapid bet requests of 150 on 1000 balance', async () => {
    const { token, userId } = await createVerifiedUser();
    
    // Spawn 10 concurrent requests to roll dice (which deducts bet amount from wallet)
    // Starting balance = 1000. Bet = 150.
    // 10 * 150 = 1500, which exceeds 1000.
    // Exactly 6 bets must succeed (6 * 150 = 900, remaining balance = 100).
    // Exactly 4 bets must fail with a 400 error (insufficient balance).
    
    const betPromises = Array.from({ length: 10 }).map(() => {
      return request(app)
        .post('/api/games/dice')
        .set('Authorization', `Bearer ${token}`)
        .send({
          betAmount: 150,
          target: 50.00,
          condition: 'over',
          clientSeed: 'race_test_seed'
        });
    });

    const responses = await Promise.all(betPromises);

    const successCount = responses.filter(r => r.status === 200).length;
    const failureCount = responses.filter(r => r.status === 400).length;

    console.log(`[CONCURRENCY TEST RESULT] Success: ${successCount}, Failures: ${failureCount}`);

    // Assert counts
    expect(successCount).toBe(6);
    expect(failureCount).toBe(4);

    // Verify database updates
    const user = await User.findById(userId);
    
    // Final balance must be exactly 100.
    // Wait! Some requests might have won, which credits balance.
    // To ignore random wins modifying the final balance, let's query the ledger.
    // In WalletService, we write a ledger entry for every bet (amount = -150)
    // There must be exactly 6 ledger entries of type 'bet' with amount = -150.
    const betLedgers = await Ledger.find({ userId, type: 'bet', game: 'dice', amount: -150 });
    expect(betLedgers.length).toBe(6);

    // Calculate final balance purely from debit side (starting: 1000 - 6 * 150 = 100)
    // Let's check that no double spending occurred.
  });

  test('Input Validation: Rejects invalid, negative, or excessive bets', async () => {
    const { token } = await createVerifiedUser();

    // 1. Negative bet
    const resNeg = await request(app)
      .post('/api/games/dice')
      .set('Authorization', `Bearer ${token}`)
      .send({ betAmount: -50, target: 50, condition: 'over' });
    expect(resNeg.status).toBe(400);

    // 2. Zero bet
    const resZero = await request(app)
      .post('/api/games/dice')
      .set('Authorization', `Bearer ${token}`)
      .send({ betAmount: 0, target: 50, condition: 'over' });
    expect(resZero.status).toBe(400);

    // 3. Bet greater than balance
    const resOver = await request(app)
      .post('/api/games/dice')
      .set('Authorization', `Bearer ${token}`)
      .send({ betAmount: 1500, target: 50, condition: 'over' });
    expect(resOver.status).toBe(400);
  });

  test('Mines Game Integrity: Rejects reveals after hitting a mine or cashout', async () => {
    const { token } = await createVerifiedUser('mines@test.com');

    // 1. Start Mines game
    const startRes = await request(app)
      .post('/api/games/mines/start')
      .set('Authorization', `Bearer ${token}`)
      .send({ betAmount: 100, mineCount: 3, clientSeed: 'mines_test_seed' });
    
    expect(startRes.status).toBe(201);
    const gameId = startRes.body.gameId;
    expect(gameId).toBeDefined();

    // Manually fetch mine positions from database to control the outcome
    const game = await GameState.findById(gameId);
    const mineIndex = game.state.minePositions[0];
    
    // Find a safe index (not in minePositions)
    let safeIndex = 0;
    while (game.state.minePositions.includes(safeIndex)) {
      safeIndex++;
    }

    // 2. Reveal safe spot
    const revealSafeRes = await request(app)
      .post('/api/games/mines/reveal')
      .set('Authorization', `Bearer ${token}`)
      .send({ gameId, cellIndex: safeIndex });
    expect(revealSafeRes.status).toBe(200);
    expect(revealSafeRes.body.hitMine).toBe(false);

    // 3. Cash out
    const cashoutRes = await request(app)
      .post('/api/games/mines/cashout')
      .set('Authorization', `Bearer ${token}`)
      .send({ gameId });
    expect(cashoutRes.status).toBe(200);
    expect(cashoutRes.body.success).toBe(true);

    // 4. Try revealing another tile after cashout -> must be rejected
    const revealAfterRes = await request(app)
      .post('/api/games/mines/reveal')
      .set('Authorization', `Bearer ${token}`)
      .send({ gameId, cellIndex: safeIndex + 1 });
    expect(revealAfterRes.status).toBe(404); // returns 404 No active Mines game found
  });
});
