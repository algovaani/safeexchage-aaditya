import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Wallet } from '../models/Wallet.js';
import { PasswordOtp } from '../models/PasswordOtp.js';
import {
  findUserByIdentifier,
  normalizeEmail,
  normalizeIdentifier,
  normalizeMobile,
} from '../utils/identifier.js';
import { error, success } from '../utils/response.js';
import { sendSmsOtp } from '../services/sms.service.js';
import { blacklistToken, signToken } from '../utils/token.js';

const DEMO_BALANCE = 10_000;
const OTP_TTL_MS = 10 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

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
    createdAt: user.createdAt,
  };
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function register(req, res, next) {
  try {
    const { password, name } = req.body;
    const email = req.body.email ? normalizeEmail(req.body.email) : undefined;
    const mobile = req.body.mobile ? normalizeMobile(req.body.mobile) : undefined;

    if (email) {
      const emailTaken = await User.findOne({ email });
      if (emailTaken) {
        return error(res, 'Email is already registered', 409);
      }
    }

    if (mobile) {
      const mobileTaken = await User.findOne({ mobile });
      if (mobileTaken) {
        return error(res, 'Mobile number is already registered', 409);
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({
      email,
      mobile,
      passwordHash,
      name: name || '',
      status: 'active',
    });

    await Wallet.create({ userId: user._id, currency: 'USDT', balance: DEMO_BALANCE });

    const token = signToken(user);
    return success(res, {
      token,
      user: publicUser(user),
    }, 'Registration successful', 201);
  } catch (e) {
    return next(e);
  }
}

export async function login(req, res, next) {
  try {
    const { identifier, password } = req.body;
    const user = await findUserByIdentifier(identifier);

    if (!user) {
      return error(res, 'Invalid credentials', 401);
    }

    if (user.status === 'blocked') {
      return error(res, 'Your account has been blocked. Contact support.', 403);
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return error(res, 'Invalid credentials', 401);
    }

    const token = signToken(user);
    return success(res, {
      token,
      user: publicUser(user),
    }, 'Login successful');
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
    const otpHash = await bcrypt.hash(otp, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await PasswordOtp.updateMany({ identifier: normalized, used: false }, { $set: { used: true } });
    await PasswordOtp.create({ identifier: normalized, otpHash, expiresAt });

    const channel = normalized.includes('@') ? 'email' : 'mobile';

    if (channel === 'mobile' && user.mobile) {
      try {
        await sendSmsOtp(user.mobile, otp);
      } catch (smsErr) {
        console.error('[auth] NinzaSMS send failed:', smsErr.message);
        return error(res, 'Could not send OTP SMS. Try again later.', 503);
      }
    } else {
      console.log(
        `[auth] Password reset OTP for ${channel} ${normalized}: ${otp} (expires in 10 minutes)`
      );
    }

    return success(res, {
      identifier: normalized,
      expiresInSeconds: OTP_TTL_MS / 1000,
    }, genericMessage);
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
