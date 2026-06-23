import { NextFunction, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest, fail } from '../utils/response.js';
import { verifyAccessToken } from '../utils/jwt.js';

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return fail(res, 'Unauthorized', 401);
  }
  try {
    const token = header.slice(7);
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status === 'BLOCKED') {
      return fail(res, 'Account blocked or not found', 403);
    }
    req.userId = user.id;
    req.userRole = user.role;
    next();
  } catch {
    return fail(res, 'Invalid or expired token', 401);
  }
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'ADMIN') {
    return fail(res, 'Admin access required', 403);
  }
  next();
}

export async function kycApprovedMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const kyc = await prisma.kYC.findUnique({ where: { userId: req.userId! } });
  if (!kyc || kyc.status !== 'APPROVED') {
    return fail(res, 'KYC approval required', 403);
  }
  next();
}
