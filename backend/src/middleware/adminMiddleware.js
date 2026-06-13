import { authMiddleware, requireAdmin } from './authMiddleware.js';

/** JWT auth + admin role check */
export const adminMiddleware = [authMiddleware, requireAdmin];
