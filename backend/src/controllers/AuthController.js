const User = require('../models/User');
const Ledger = require('../models/Ledger');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

// Helper to generate 6-digit numeric OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const crypto = require('crypto');

// Send OTP via SMS (Twilio) or Email (SMTP) or print in console (Mock)
function isGenuineEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) return false;
  
  const domain = email.split('@')[1].toLowerCase();
  
  // List of standard fake/unusual domains to ignore
  const fakeDomains = ['example.com', 'test.com', 'localhost', 'tempmail.com', 'mailinator.com', 'trashmail.com', 'fake.com', 'invalid.com'];
  if (fakeDomains.includes(domain)) return false;
  
  // Ignore mock prefixes
  if (email.startsWith('mock_') || email.startsWith('test_')) return false;
  
  return true;
}

async function sendEmail(to, subject, text, html) {
  if (!isGenuineEmail(to)) {
    console.log(`\n========================================`);
    console.log(`[SKIPPED SMTP DELIVERY - NOT A GENUINE EMAIL]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Text: ${text}`);
    console.log(`========================================\n`);
    return true; // Pretend it succeeded to maintain normal flow without crashes
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@fortuneplayx.local',
        to,
        subject,
        text,
        html
      });
      return true;
    } catch (err) {
      console.error('SMTP Send Failure:', err.message);
    }
  } else {
    console.log(`[FALLBACK MOCK EMAIL] To: ${to} | Subject: ${subject} | Code logged to console.`);
  }
  return false;
}

async function sendOTP(user, code) {
  const isMock = process.env.MOCK_MODE === 'true' || 
                 (!process.env.TWILIO_ACCOUNT_SID && !process.env.SMTP_HOST);

  if (isMock) {
    console.log(`\n========================================`);
    console.log(`[MOCK OTP] For user: ${user.email}`);
    console.log(`OTP Code: ${code}`);
    console.log(`========================================\n`);
    return true;
  }

  // SMS Twilio
  const hasTwilio = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_SERVICE_SID || process.env.TWILIO_PHONE_NUMBER);
  if (user.phone && hasTwilio) {
    try {
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        body: `Your verification code is: ${code}`,
        to: user.phone,
        from: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_SERVICE_SID
      });
      return true;
    } catch (err) {
      console.error('Twilio Send Failure:', err.message);
    }
  }

  // Email SMTP
  return sendEmail(
    user.email,
    'FortunePlayX - OTP Verification Code',
    `Your verification code is: ${code}`,
    `<p>Your verification code is: <strong>${code}</strong></p>`
  );
}

// Generate JWT token
function generateToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'super_secret_virtual_gaming_key_123!@#',
    { expiresIn: '7d' }
  );
}

exports.register = async (req, res) => {
  try {
    const { email, password, phone } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otpCode = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // 1. Create user with 1000 coins starting balance
    const user = new User({
      email,
      password: hashedPassword,
      phone: phone || '',
      balance: 1000.0,
      otp: {
        code: otpCode,
        expiresAt: otpExpiry,
        verified: false
      },
      verificationToken
    });

    await user.save();

    // 2. Add signup reward ledger entry (immutable)
    const ledger = new Ledger({
      userId: user._id,
      amount: 1000.0,
      type: 'reward',
      game: 'signup_reward',
      resultingBalance: 1000.0
    });
    await ledger.save();

    // 3. Dispatch verification link & OTP
    const verifyLink = `http://localhost:4200/auth?verifyToken=${verificationToken}`;
    const mailText = `Welcome to FortuneNovaPlayX! To activate your account, please verify your email by clicking: ${verifyLink}`;
    const mailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0f172a; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); color: #f8fafc; text-align: center;">
        <h2 style="color: #06b6d4; font-size: 24px; margin-bottom: 20px;">Welcome to FortuneNovaPlayX! 🎲</h2>
        <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px;">
          Thanks for signing up to the premium casino playground! We have credited <strong>1,000 Free Coins</strong> to your wallet.
        </p>
        <p style="font-size: 15px; color: #94a3b8; margin-bottom: 30px;">
          Please verify your email address to unlock your wallet and start playing.
        </p>
        <a href="${verifyLink}" style="display: inline-block; background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%); color: #000; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(6, 182, 212, 0.3);">
          Verify Email Address
        </a>
        <p style="font-size: 12px; color: #64748b; margin-top: 40px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 20px;">
          If the button does not work, copy and paste this address into your browser:<br>
          <a href="${verifyLink}" style="color: #06b6d4; text-decoration: underline;">${verifyLink}</a>
        </p>
      </div>
    `;
    await sendEmail(user.email, 'Verify Your Email - FortuneNovaPlayX', mailText, mailHtml);

    console.log(`\n========================================`);
    console.log(`[VERIFICATION LINK DISPATCHED]`);
    console.log(`Verify URL: ${verifyLink}`);
    console.log(`========================================\n`);

    await sendOTP(user, otpCode);

    const token = generateToken(user._id);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        balance: user.balance,
        otpVerified: user.otp.verified
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user || !user.password) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        balance: user.balance,
        otpVerified: user.otp.verified,
        avatar: user.avatar || 'avatar-ninja'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'OTP code is required.' });
    }

    const user = req.user;
    if (user.otp.verified) {
      return res.status(400).json({ error: 'User already verified.' });
    }

    if (user.otp.code !== code) {
      return res.status(400).json({ error: 'Invalid OTP code.' });
    }

    if (new Date() > user.otp.expiresAt) {
      return res.status(400).json({ error: 'OTP code has expired.' });
    }

    user.otp.verified = true;
    user.otp.code = null;
    user.otp.expiresAt = null;
    await user.save();

    res.json({
      success: true,
      message: 'OTP verified successfully.',
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        balance: user.balance,
        otpVerified: true
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.resendOtp = async (req, res) => {
  try {
    const user = req.user;
    if (user.otp.verified) {
      return res.status(400).json({ error: 'User already verified.' });
    }

    const otpCode = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.otp.code = otpCode;
    user.otp.expiresAt = otpExpiry;
    await user.save();

    await sendOTP(user, otpCode);

    res.json({ success: true, message: 'OTP code re-sent successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Social login handles simulated/mock OAuth2 requests (production-ready stubbing)
exports.socialLogin = async (req, res) => {
  try {
    const { email, name, id, provider, token: socialToken } = req.body;
    
    let emailAddress = email;
    let socialId = id;
    let userName = name;

    if (provider === 'google' && socialToken && !socialToken.startsWith('mock_')) {
      try {
        const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${socialToken}`;
        const response = await fetch(verifyUrl);
        if (!response.ok) {
          return res.status(400).json({ error: 'Failed to verify Google token.' });
        }
        const payload = await response.json();
        
        // Validate client ID audience
        const targetClientId = process.env.GOOGLE_CLIENT_ID || '965877400039-isl9dli56jh3qqqeqt9of8gccneahs5o.apps.googleusercontent.com';
        if (payload.aud !== targetClientId) {
          return res.status(400).json({ error: 'Google client ID mismatch.' });
        }
        
        emailAddress = payload.email;
        socialId = payload.sub;
        userName = payload.name;
      } catch (err) {
        return res.status(400).json({ error: `Google verification failed: ${err.message}` });
      }
    } else {
      if (!emailAddress || !socialId || !provider) {
        return res.status(400).json({ error: 'Missing social profile fields.' });
      }
    }

    let user = await User.findOne({ email: emailAddress });

    if (!user) {
      // Create user if not exists
      user = new User({
        email: emailAddress,
        balance: 1000.0,
        otp: { verified: true } // Auto-verify social users
      });
      if (provider === 'google') user.googleId = socialId;
      if (provider === 'facebook') user.facebookId = socialId;
      
      await user.save();

      // Ledger reward
      const ledger = new Ledger({
        userId: user._id,
        amount: 1000.0,
        type: 'reward',
        game: 'signup_reward',
        resultingBalance: 1000.0
      });
      await ledger.save();
    } else {
      // Update social identity association if needed
      let changed = false;
      if (provider === 'google' && !user.googleId) {
        user.googleId = socialId;
        changed = true;
      }
      if (provider === 'facebook' && !user.facebookId) {
        user.facebookId = socialId;
        changed = true;
      }
      if (changed) {
        await user.save();
      }
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        balance: user.balance,
        otpVerified: user.otp.verified,
        avatar: user.avatar || 'avatar-ninja'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Verify Email Link
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: 'Verification token is required.' });
    }

    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification link.' });
    }

    user.otp.verified = true;
    user.verificationToken = null;
    await user.save();

    // Send Onboarding Success Email
    const onboardText = `Congratulations! You have successfully onboarded at FortuneNovaPlayX. Your signup reward of 1,000 Coins is now fully unlocked!`;
    const onboardHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #0f172a; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); color: #f8fafc; text-align: center;">
        <h2 style="color: #10b981; font-size: 24px; margin-bottom: 20px;">Successfully Onboarded! 🎉</h2>
        <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1; margin-bottom: 24px;">
          Congratulations! Your email address has been successfully verified.
        </p>
        <p style="font-size: 16px; color: #cbd5e1; margin-bottom: 30px;">
          Your signup bonus of <strong>1,000 Game Coins</strong> is now active in your wallet. Use them to play Dice Arena, Mines Grid, Fruit Cut Ninja, and Ludo Quick Run!
        </p>
        <a href="http://localhost:4200/dashboard" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; text-decoration: none; padding: 12px 30px; border-radius: 6px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">
          Go to Dashboard & Play
        </a>
      </div>
    `;
    await sendEmail(user.email, 'Successfully Onboarded - FortuneNovaPlayX!', onboardText, onboardHtml);

    res.json({ message: 'Email verified successfully!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Login via Email OTP: Send Code
exports.loginOtpRequest = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'No user registered with this email address.' });
    }

    const otpCode = generateOTP();
    user.otp.code = otpCode;
    user.otp.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    await sendOTP(user, otpCode);

    res.json({ message: 'Verification OTP sent successfully to your email.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Login via Email OTP: Verify Code
exports.loginOtpVerify = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and OTP code are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'No user found with this email.' });
    }

    if (!user.otp.code || user.otp.code !== code || new Date() > user.otp.expiresAt) {
      return res.status(400).json({ error: 'Invalid or expired OTP code.' });
    }

    user.otp.code = null;
    user.otp.verified = true;
    await user.save();

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        balance: user.balance,
        otpVerified: user.otp.verified,
        avatar: user.avatar || 'avatar-ninja'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update Profile Details (phone, email, avatar)
exports.updateProfile = async (req, res) => {
  try {
    const { email, phone, avatar } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Check if updating email and if it's already taken
    if (email && email.toLowerCase() !== user.email) {
      const emailTaken = await User.findOne({ email: email.toLowerCase() });
      if (emailTaken) {
        return res.status(400).json({ error: 'Email address is already in use.' });
      }
      user.email = email.toLowerCase();
    }

    if (phone !== undefined) {
      user.phone = phone;
    }
    if (avatar) {
      user.avatar = avatar;
    }

    await user.save();

    res.json({
      message: 'Profile updated successfully.',
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
        balance: user.balance,
        otpVerified: user.otp.verified,
        avatar: user.avatar
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // If user has a local password hash, verify the old password first
    if (user.password) {
      if (!oldPassword) {
        return res.status(400).json({ error: 'Current password is required to set a new password.' });
      }
      const isMatch = await bcrypt.compare(oldPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
