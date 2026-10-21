import fs from 'fs';
import multer from 'multer';
import path from 'path';

/** Writable directory — backend/uploads is often root-owned in dev; files live in storage/ instead. */
const UPLOAD_DIR = path.join(process.cwd(), 'storage', 'cash-in-person');
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

function ensureDir() {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch {
    /* ignore if exists or handled */
  }
}

ensureDir();

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureDir();
      cb(null, UPLOAD_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const userId = req.userId || 'user';
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
    const name = `cip_${userId}_${Date.now()}_${Math.random().toString(16).slice(2)}${cleanExt}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    cb(new Error('Payment proof must be an image (JPG, PNG, WebP) or PDF'));
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES, files: 1 },
}).fields([
  { name: 'payment_proof', maxCount: 1 },
  { name: 'screenshot', maxCount: 1 },
]);

export function cashInPersonProofUpload(req, res, next) {
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ ok: false, error: err.message || 'File upload failed' });
    }
    const file = req.files?.payment_proof?.[0] || req.files?.screenshot?.[0] || req.file;
    if (file) {
      req.proofFile = file;
      req.proofPath = `storage/cash-in-person/${file.filename}`.replace(/\\/g, '/');
    }
    next();
  });
}
