import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  forgotPassword,
  getMe,
  listSessions,
  loginUser,
  logoutSession,
  refreshSession,
  registerUser,
  resetPassword,
  revokeSession,
  verifyEmail,
} from '../services/auth.service.js';
import { validateBody } from '../middleware/validate.js';
import {
  forgotSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetSchema,
  verifyEmailSchema,
} from '../validators/auth.schema.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthRequest } from '../utils/response.js';
import { paramId } from '../utils/params.js';
import { fail, success } from '../utils/response.js';

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

function clientMeta(req: AuthRequest) {
  return {
    deviceInfo: req.headers['user-agent'] || undefined,
    ip: req.ip,
  };
}

router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  try {
    const data = await registerUser({ ...req.body, ...clientMeta(req) });
    return success(res, data, 'Registration successful', 201);
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return fail(res, err.message || 'Registration failed', err.status || 500);
  }
});

router.post('/verify-email', authLimiter, validateBody(verifyEmailSchema), async (req, res) => {
  try {
    const user = await verifyEmail(req.body.email, req.body.otp);
    return success(res, user, 'Email verified');
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return fail(res, err.message || 'Verification failed', err.status || 400);
  }
});

router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  try {
    const data = await loginUser({ ...req.body, ...clientMeta(req) });
    return success(res, data, 'Login successful');
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return fail(res, err.message || 'Login failed', err.status || 401);
  }
});

router.post('/refresh', validateBody(refreshSchema), async (req, res) => {
  try {
    const data = await refreshSession(req.body.refreshToken);
    return success(res, data, 'Token refreshed');
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return fail(res, err.message || 'Refresh failed', err.status || 401);
  }
});

router.post('/logout', validateBody(refreshSchema), async (req, res) => {
  await logoutSession(req.body.refreshToken);
  return success(res, null, 'Logged out');
});

router.post('/forgot-password', authLimiter, validateBody(forgotSchema), async (req, res) => {
  await forgotPassword(req.body.email);
  return success(res, null, 'If the email exists, an OTP has been sent');
});

router.post('/reset-password', authLimiter, validateBody(resetSchema), async (req, res) => {
  try {
    await resetPassword(req.body.email, req.body.otp, req.body.newPassword);
    return success(res, null, 'Password reset successful');
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return fail(res, err.message || 'Reset failed', err.status || 400);
  }
});

router.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  const user = await getMe(req.userId!);
  return success(res, user, 'Profile fetched');
});

router.get('/sessions', authMiddleware, async (req: AuthRequest, res) => {
  const sessions = await listSessions(req.userId!);
  return success(res, sessions, 'Sessions fetched');
});

router.delete('/sessions/:id', authMiddleware, async (req: AuthRequest, res) => {
  await revokeSession(req.userId!, paramId(req.params.id));
  return success(res, null, 'Session revoked');
});

export default router;
