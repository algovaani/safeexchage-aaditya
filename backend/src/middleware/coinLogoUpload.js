import fs from 'fs';
import multer from 'multer';
import path from 'path';

/** Writable dir — backend/uploads is often root-owned in dev; files live here instead. */
const PHYSICAL_DIR = path.join(process.cwd(), 'storage', 'coins');
const PUBLIC_PREFIX = 'uploads/coins';
const MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_EXT = /\.(jpe?g|png|webp|gif)$/i;

function ensureCoinLogoDir() {
  fs.mkdirSync(PHYSICAL_DIR, { recursive: true });
}

function extFromName(name) {
  const ext = path.extname(name).toLowerCase();
  if (ALLOWED_EXT.test(ext)) return ext;
  return '';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      ensureCoinLogoDir();
      cb(null, PHYSICAL_DIR);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const pairId = String(req.params.id || 'coin').replace(/[^a-zA-Z0-9]/g, '');
    const ext = extFromName(file.originalname) || '.png';
    const name = `${pairId}_${Date.now()}_logo${ext}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  const extOk = ALLOWED_EXT.test(file.originalname);
  const mimeOk = ALLOWED_MIME.has(file.mimetype);
  if (!extOk || !mimeOk) {
    cb(new Error('Only JPG, PNG, WebP, and GIF images are allowed'));
    return;
  }
  cb(null, true);
}

export const coinLogoUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES, files: 1 },
});

export function storedCoinLogoPath(filename) {
  return path.join(PUBLIC_PREFIX, filename).replace(/\\/g, '/');
}

export function physicalCoinLogoPath(filename) {
  return path.join(PHYSICAL_DIR, filename);
}

export function removeCoinLogoFile(storedPath) {
  if (!storedPath || !storedPath.includes('uploads/coins/')) return;
  const filename = path.basename(storedPath);
  const full = physicalCoinLogoPath(filename);
  fs.unlink(full, () => {});
}

export { PHYSICAL_DIR };
