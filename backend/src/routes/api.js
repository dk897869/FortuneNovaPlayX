const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth');
const AuthController = require('../controllers/AuthController');
const WalletController = require('../controllers/WalletController');
const GameController = require('../controllers/GameController');

// --- Auth Routes ---
router.post('/auth/register', AuthController.register);
router.post('/auth/login', AuthController.login);
router.post('/auth/login-otp-request', AuthController.loginOtpRequest);
router.post('/auth/login-otp-verify', AuthController.loginOtpVerify);
router.get('/auth/verify-email', AuthController.verifyEmail);
router.post('/auth/social-login', AuthController.socialLogin);
router.post('/auth/verify-otp', auth, AuthController.verifyOtp);
router.post('/auth/resend-otp', auth, AuthController.resendOtp);
router.post('/user/update', auth, AuthController.updateProfile);
router.post('/user/change-password', auth, AuthController.changePassword);
router.post('/user/delete', auth, AuthController.deleteProfile);

// --- Wallet Routes ---
router.get('/wallet/balance', auth, WalletController.getBalance);
router.get('/wallet/history', auth, WalletController.getHistory);
router.get('/wallet/leaderboard', auth, WalletController.getLeaderboard);
router.post('/wallet/claim-daily', auth, WalletController.claimDailyBonus);
router.post('/wallet/deposit', auth, WalletController.deposit);
router.post('/wallet/withdraw', auth, WalletController.withdraw);

// --- Game Routes ---
router.post('/games/dice', auth, GameController.rollDice);
router.post('/games/mines/start', auth, GameController.startMines);
router.post('/games/mines/reveal', auth, GameController.revealCell);
router.post('/games/mines/cashout', auth, GameController.cashoutMines);
router.post('/games/ludo/bet', auth, GameController.startLudo);
router.post('/games/ludo/roll-dice', auth, GameController.rollLudo);
router.post('/games/ludo/claim-win', auth, GameController.cashoutLudo);

module.exports = router;
