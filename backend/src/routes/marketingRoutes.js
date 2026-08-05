import { Router } from 'express';
import { optionalAuthMiddleware } from '../middleware/authMiddleware.js';
import * as marketing from '../controllers/marketingController.js';

const r = Router();

r.get('/banners/active', marketing.activeBanners);
r.get('/notices/active', marketing.activeNotices);
r.get('/support/contacts', optionalAuthMiddleware, marketing.activeSupportContacts);

export default r;

