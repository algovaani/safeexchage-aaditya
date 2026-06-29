import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { validateRequest } from '../middleware/validateRequest.js';
import {
  adminLoginValidators,
  forgotPasswordValidators,
  loginValidators,
  registerValidators,
  resendOtpValidators,
  resetPasswordValidators,
  sendOtpValidators,
} from '../validators/authValidators.js';
import { userWalletProfileValidators } from '../validators/depositValidators.js';
import { otpIpRateLimit, otpMobileRateLimit } from '../middleware/otpRateLimit.js';

const r = Router();

const otpLimits = [otpIpRateLimit, otpMobileRateLimit];

r.post('/otp/send', ...otpLimits, sendOtpValidators, validateRequest, auth.sendOtp);
r.post('/otp/resend', ...otpLimits, resendOtpValidators, validateRequest, auth.resendOtp);
r.post('/register', registerValidators, validateRequest, auth.register);
r.post('/login', loginValidators, validateRequest, auth.login);
r.post('/admin/login', adminLoginValidators, validateRequest, auth.adminLogin);
r.post('/forgot-password', forgotPasswordValidators, validateRequest, auth.forgotPassword);
r.post('/reset-password', resetPasswordValidators, validateRequest, auth.resetPassword);
r.post('/logout', authMiddleware, auth.logout);
r.get('/me', authMiddleware, auth.me);
r.patch('/profile', authMiddleware, userWalletProfileValidators, validateRequest, auth.updateProfile);
r.get('/referral', authMiddleware, auth.referralSummary);

export default r;
