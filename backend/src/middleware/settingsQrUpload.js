import fs from 'fs';
import multer from 'multer';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'storage', 'settings', 'qr');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

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
  'image/svg+xml',
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
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
    const name = `bank_qr_${Date.now()}_${Math.random().toString(16).slice(2)}${cleanExt}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    cb(new Error('Only image files are allowed (JPG, PNG, WebP, SVG, GIF)'));
    return;
  }
  cb(null, true);
}

export const settingsQrUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES },
});

export const settingsQrUploadSingle = settingsQrUpload.single('qrCode');
