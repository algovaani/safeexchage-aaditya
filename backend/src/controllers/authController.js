import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { Wallet } from '../models/Wallet.js';
import { PasswordOtp } from '../models/PasswordOtp.js';
import {
  findUserByIdentifier,
  findUserByMobile,
  normalizeEmail,
  normalizeIdentifier,
  normalizeIndianMobile,
  toIndianMobile10,
} from '../utils/identifier.js';
import { error, success } from '../utils/response.js';
import { sendSmsOtp } from '../services/sms.service.js';
import { blacklistToken, signToken } from '../utils/token.js';
import { findUserByReferralCode, normalizeReferralCode } from '../utils/referral.js';
import { creditReferrerForSignup, getReferralRewardAmount } from '../services/referralRewardService.js';

const INITIAL_BALANCE = 0;
const OTP_TTL_MS = 10 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
const OTP_PURPOSES = ['login', 'register'];

function publicUser(user) {
  return {
    id: user._id,
    email: user.email || null,
    mobile: user.mobile || null,
    name: user.name,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    mobileVerified: user.mobileVerified,
    referralCode: user.referralCode || null,
    referredBy: user.referredBy || null,
    bnbWalletAddress: user.bnbWalletAddress || '',
    ethWalletAddress: user.ethWalletAddress || '',
    trcWalletAddress: user.trcWalletAddress || '',
    usdtWalletAddress: user.usdtWalletAddress || '',
    createdAt: user.createdAt,
  };
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function randomPasswordHash() {
  return bcrypt.hash(crypto.randomBytes(24).toString('hex'), BCRYPT_ROUNDS);
}

async function storeOtp(mobile, purpose, otp) {
  const identifier = normalizeIndianMobile(mobile);
  const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await PasswordOtp.updateMany({ identifier, purpose, used: false }, { $set: { used: true } });
  await PasswordOtp.create({ identifier, purpose, otpHash, expiresAt });

  return { identifier, expiresAt };
}

async function verifyStoredOtp(mobile, purpose, otp) {
  const identifier = normalizeIndianMobile(mobile);
  const record = await PasswordOtp.findOne({
    identifier,
    purpose,
    used: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!record) {
    return { ok: false, message: 'OTP expired or not found. Request a new one.' };
  }

  const otpValid = await bcrypt.compare(otp, record.otpHash);
  if (!otpValid) {
    return { ok: false, message: 'Invalid OTP' };
  }

  record.used = true;
  await record.save();
  return { ok: true, identifier };
}

async function dispatchOtpSms(mobile, otp) {
  try {
    const result = await sendSmsOtp(mobile, otp);
    if (result.skipped) {
      console.log(`[auth] Dev OTP for ${normalizeIndianMobile(mobile)}: ${otp}`);
    }
    return true;
  } catch (smsErr) {
    console.error('[auth] NinzaSMS send failed:', smsErr.message);
    return false;
  }
}

export async function sendOtp(req, res, next) {
  try {
    const { purpose } = req.body;
    const mobile = normalizeIndianMobile(req.body.mobile);

    if (!mobile || !toIndianMobile10(mobile)) {
      return error(res, 'Valid 10-digit Indian mobile number is required', 400);
    }

    if (!OTP_PURPOSES.includes(purpose)) {
      return error(res, 'Invalid OTP purpose', 400);
    }

    const existing = await findUserByMobile(mobile);

    if (purpose === 'register' && existing) {
      return error(res, 'Mobile number is already registered', 409);
    }

    if (purpose === 'login' && !existing) {
      return error(res, 'No account found for this mobile number', 404);
    }

    if (purpose === 'login' && existing?.status === 'blocked') {
      return error(res, 'Your account has been blocked. Contact support.', 403);
    }

    const otp = generateOtp();
    await storeOtp(mobile, purpose, otp);

    const sent = await dispatchOtpSms(mobile, otp);
    if (!sent) {
      return error(res, 'Could not send OTP SMS. Try again later.', 503);
    }

    return success(
      res,
      {
        mobile,
        purpose,
        expiresInSeconds: OTP_TTL_MS / 1000,
      },
      'OTP sent successfully'
    );
  } catch (e) {
    return next(e);
  }
}

export async function resendOtp(req, res, next) {
  return sendOtp(req, res, next);
}

export async function register(req, res, next) {
  try {
    const { otp, name, password } = req.body;
    const mobile = normalizeIndianMobile(req.body.mobile);
    const email = req.body.email ? normalizeEmail(req.body.email) : undefined;
    const referralInput = req.body.referralCode || req.body.referral;
    const referralCode = normalizeReferralCode(referralInput);

    if (!mobile || !toIndianMobile10(mobile)) {
      return error(res, 'Valid 10-digit Indian mobile number is required', 400);
    }

    if (!otp) {
      return error(res, 'OTP is required', 400);
    }

    const otpCheck = await verifyStoredOtp(mobile, 'register', otp);
    if (!otpCheck.ok) {
      return error(res, otpCheck.message, 400);
    }

    const mobileTaken = await findUserByMobile(mobile);
    if (mobileTaken) {
      return error(res, 'Mobile number is already registered', 409);
    }

    if (email) {
      const emailTaken = await User.findOne({ email });
      if (emailTaken) {
        return error(res, 'Email is already registered', 409);
      }
    }

    let referredBy = null;
    let referrer = null;
    if (referralCode) {
      referrer = await findUserByReferralCode(referralCode);
      if (!referrer) {
        return error(res, 'Invalid referral code', 400);
      }
      if (referrer.status === 'blocked') {
        return error(res, 'This referral code is not active', 400);
      }
      referredBy = referrer._id;
    }

    const passwordHash = password
      ? await bcrypt.hash(password, BCRYPT_ROUNDS)
      : await randomPasswordHash();

    const user = await User.create({
      email,
      mobile,
      passwordHash,
      name: name || '',
      status: 'active',
      mobileVerified: true,
      referredBy,
    });

    await Wallet.create({ userId: user._id, currency: 'USDT', balance: INITIAL_BALANCE });

    if (referrer) {
      const referredLabel = user.name || user.mobile || user.email || String(user._id);
      await creditReferrerForSignup({
        referrerId: referrer._id,
        referredUserId: user._id,
        referredLabel,
      }).catch((err) => {
        console.error('[referral] reward credit failed:', err.message);
      });
    }

    const token = signToken(user);
    return success(
      res,
      {
        token,
        user: publicUser(user),
      },
      'Registration successful',
      201
    );
  } catch (e) {
    return next(e);
  }
}

export async function login(req, res, next) {
  try {
    const { otp } = req.body;
    const mobile = normalizeIndianMobile(req.body.mobile);

    if (!mobile || !toIndianMobile10(mobile)) {
      return error(res, 'Valid 10-digit Indian mobile number is required', 400);
    }

    if (!otp) {
      return error(res, 'OTP is required', 400);
    }

    const user = await findUserByMobile(mobile);
    if (!user) {
      return error(res, 'No account found for this mobile number', 404);
    }

    if (user.status === 'blocked') {
      return error(res, 'Your account has been blocked. Contact support.', 403);
    }

    if (user.role === 'admin') {
      return error(res, 'Use admin login for admin accounts', 403);
    }

    const otpCheck = await verifyStoredOtp(mobile, 'login', otp);
    if (!otpCheck.ok) {
      return error(res, otpCheck.message, 400);
    }

    if (!user.mobileVerified) {
      user.mobileVerified = true;
      await user.save();
    }

    const token = signToken(user);
    return success(
      res,
      {
        token,
        user: publicUser(user),
      },
      'Login successful'
    );
  } catch (e) {
    return next(e);
  }
}

export async function adminLogin(req, res, next) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const user = await User.findOne({ email: normalizedEmail });

    if (!user || user.role !== 'admin') {
      return error(res, 'Invalid admin credentials', 401);
    }

    if (user.status === 'blocked') {
      return error(res, 'Your account has been blocked. Contact support.', 403);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return error(res, 'Invalid admin credentials', 401);
    }

    const token = signToken(user);
    return success(
      res,
      {
        token,
        user: publicUser(user),
      },
      'Admin login successful'
    );
  } catch (e) {
    return next(e);
  }
}

export async function forgotPassword(req, res, next) {
  try {
    const { identifier } = req.body;
    const normalized = normalizeIdentifier(identifier);
    const user = await findUserByIdentifier(identifier);

    const genericMessage =
      'If an account exists for this email or mobile, an OTP has been sent.';

    if (!user) {
      return success(res, null, genericMessage);
    }

    if (user.status === 'blocked') {
      return error(res, 'Your account has been blocked. Contact support.', 403);
    }

    const otp = generateOtp();
    const purpose = 'password_reset';
    const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await PasswordOtp.updateMany({ identifier: normalized, purpose, used: false }, { $set: { used: true } });
    await PasswordOtp.create({ identifier: normalized, purpose, otpHash, expiresAt });

    const channel = normalized.includes('@') ? 'email' : 'mobile';

    if (channel === 'mobile' && user.mobile) {
      const sent = await dispatchOtpSms(user.mobile, otp);
      if (!sent) {
        return error(res, 'Could not send OTP SMS. Try again later.', 503);
      }
    } else {
      console.log(
        `[auth] Password reset OTP for ${channel} ${normalized}: ${otp} (expires in 10 minutes)`
      );
    }

    return success(
      res,
      {
        identifier: normalized,
        expiresInSeconds: OTP_TTL_MS / 1000,
      },
      genericMessage
    );
  } catch (e) {
    return next(e);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { identifier, otp, newPassword } = req.body;
    const normalized = normalizeIdentifier(identifier);
    const user = await findUserByIdentifier(identifier);

    if (!user) {
      return error(res, 'Invalid OTP or identifier', 400);
    }

    if (user.status === 'blocked') {
      return error(res, 'Your account has been blocked. Contact support.', 403);
    }

    const record = await PasswordOtp.findOne({
      identifier: normalized,
      purpose: 'password_reset',
      used: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!record) {
      return error(res, 'OTP expired or not found. Request a new one.', 400);
    }

    const otpValid = await bcrypt.compare(otp, record.otpHash);
    if (!otpValid) {
      return error(res, 'Invalid OTP', 400);
    }

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await user.save();

    record.used = true;
    await record.save();

    return success(res, null, 'Password reset successful. Please login with your new password.');
  } catch (e) {
    return next(e);
  }
}

export async function logout(req, res, next) {
  try {
    if (req.authToken) {
      await blacklistToken(req.authToken);
    }
    return success(res, null, 'Logged out successfully');
  } catch (e) {
    return next(e);
  }
}

export async function me(req, res, next) {
  try {
    const user = await User.findById(req.userId).select('-passwordHash').lean();
    if (!user) {
      return error(res, 'User not found', 404);
    }
    return success(res, publicUser(user), 'Profile fetched');
  } catch (e) {
    return next(e);
  }
}

export async function referralSummary(req, res, next) {
  try {
    const user = await User.findById(req.userId).select('referralCode').lean();
    if (!user) {
      return error(res, 'User not found', 404);
    }
    const invitedCount = await User.countDocuments({ referredBy: req.userId });
    const referralRewardUsdt = await getReferralRewardAmount();
    return success(res, {
      referralCode: user.referralCode || null,
      invitedCount,
      referralRewardUsdt,
      invitePath: user.referralCode ? `/invite/${user.referralCode}` : null,
    }, 'Referral summary fetched');
  } catch (e) {
    return next(e);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return error(res, 'User not found', 404);

    const allowed = ['name', 'bnbWalletAddress', 'ethWalletAddress', 'trcWalletAddress', 'usdtWalletAddress'];
    for (const key of allowed) {
      if (req.body[key] === undefined) continue;
      let val = String(req.body[key] || '').trim();
      if (key === 'trcWalletAddress' || key === 'usdtWalletAddress') {
        val = val.replace(/\s+/g, '');
      }
      user[key] = val;
    }

    await user.save();
    return success(res, publicUser(user.toObject()), 'Profile updated');
  } catch (e) {
    return next(e);
  }
}
