import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import * as kyc from '../controllers/kycController.js';
import { requireAuth } from '../middleware/auth.js';

const uploadDir = path.join(process.cwd(), 'uploads', 'kyc');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, safe);
  },
});

const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

const r = Router();

r.post('/', requireAuth, upload.single('file'), kyc.upload);
r.get('/me', requireAuth, kyc.myStatus);

export default r;
