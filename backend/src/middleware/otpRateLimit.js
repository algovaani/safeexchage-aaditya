import rateLimit from 'express-rate-limit';
import { toIndianMobile10 } from '../utils/identifier.js';

function otpRateLimitResponse(res, message) {
  return res.status(429).json({
    success: false,
    message,
    data: null,
    errors: null,
    timestamp: new Date().toISOString(),
  });
}

function otpKey(req) {
  const mobile = toIndianMobile10(req.body?.mobile || '');
  if (mobile) return `otp-mobile:${mobile}`;
  return `otp-ip:${req.ip}`;
}

/** Max OTP sends per mobile number (send + resend share this bucket). */
export const otpMobileRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.OTP_RATE_LIMIT_PER_MOBILE) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: otpKey,
  handler: (_req, res) =>
    otpRateLimitResponse(
      res,
      'Too many OTP requests for this number. Please wait 10 minutes and try again.'
    ),
});

/** Backup cap per client IP to limit abuse across many numbers. */
export const otpIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.OTP_RATE_LIMIT_PER_IP) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    otpRateLimitResponse(res, 'Too many OTP requests from your network. Please try again later.'),
});
