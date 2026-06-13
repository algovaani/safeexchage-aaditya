import { User } from '../models/User.js';
import { error } from '../utils/response.js';
import { isTokenBlacklisted, verifyToken } from '../utils/token.js';

function extractBearerToken(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}

/** Verify JWT, reject blacklisted tokens, attach req.user + account status checks */
export async function authMiddleware(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return error(res, 'Unauthorized', 401);
  }

  try {
    if (await isTokenBlacklisted(token)) {
      return error(res, 'Session expired. Please login again.', 401);
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub).select('-passwordHash').lean();
    if (!user) {
      return error(res, 'User not found', 401);
    }

    if (user.status === 'blocked') {
      return error(res, 'Your account has been blocked. Contact support.', 403);
    }

    req.userId = user._id.toString();
    req.userRole = user.role;
    req.user = user;
    req.authToken = token;
    return next();
  } catch {
    return error(res, 'Invalid or expired token', 401);
  }
}

export function requireAdmin(req, res, next) {
  const role = req.user?.role ?? req.userRole;
  if (role !== 'admin') {
    return error(res, 'Forbidden', 403);
  }
  return next();
}

export async function loadUser(req, res, next) {
  if (!req.userId) return next();
  if (req.user) return next();
  const user = await User.findById(req.userId).select('-passwordHash').lean();
  req.user = user;
  return next();
}

/** @deprecated Use authMiddleware — kept for existing imports */
export const requireAuth = authMiddleware;
