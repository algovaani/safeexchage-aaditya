import fs from 'fs';
import multer from 'multer';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'deposits', 'fiat');
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const ALLOWED_EXT = /\.(jpe?g|png|pdf)$/i;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function extFromName(name) {
  const ext = path.extname(name).toLowerCase();
  return ALLOWED_EXT.test(ext) ? ext : '';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const userId = req.userId || 'unknown';
    const ext = extFromName(file.originalname) || '.bin';
    const name = `${userId}_${Date.now()}_payment_proof${ext}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  const extOk = ALLOWED_EXT.test(file.originalname);
  const mimeOk = ALLOWED_MIME.has(file.mimetype);
  if (!extOk || !mimeOk) {
    cb(new Error('payment_proof must be JPG, PNG, or PDF'));
    return;
  }
  cb(null, true);
}

export const fiatDepositUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES, files: 1 },
});

export const fiatProofUpload = fiatDepositUpload.single('payment_proof');

export function storedFiatProofPath(filename) {
  return path.join('uploads', 'deposits', 'fiat', filename).replace(/\\/g, '/');
}

export function removeFiatProof(file) {
  if (file?.path) fs.unlink(file.path, () => {});
}
