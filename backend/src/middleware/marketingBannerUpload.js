import fs from 'fs';
import multer from 'multer';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'storage', 'marketing', 'banners');
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function storedFilePath(filename) {
  return path.join('storage', 'marketing', 'banners', filename).replace(/\\/g, '/');
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const userId = req.userId || 'unknown';
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const cleanExt = ext.startsWith('.') ? ext : `.${ext}`;
    const name = `banner_${userId}_${Date.now()}_${Math.random().toString(16).slice(2)}${cleanExt}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  if (!ALLOWED_MIME.has(file.mimetype)) {
    cb(new Error('Only image files are allowed (jpg/png/webp/gif)'));
    return;
  }
  cb(null, true);
}

export const marketingBannerImageUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES },
});

export const marketingBannerImageUploadSingle = marketingBannerImageUpload.single('image');
export { storedFilePath };

