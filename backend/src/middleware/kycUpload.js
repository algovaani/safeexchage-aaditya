import fs from 'fs';
import multer from 'multer';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'kyc');
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const ALLOWED_EXT = /\.(jpe?g|png|pdf)$/i;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function extFromName(name) {
  const ext = path.extname(name).toLowerCase();
  if (ALLOWED_EXT.test(ext)) return ext;
  return '';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const userId = req.userId || 'unknown';
    const ext = extFromName(file.originalname) || '.bin';
    const field = file.fieldname.replace(/[^a-zA-Z0-9_]/g, '_');
    const name = `${userId}_${Date.now()}_${field}${ext}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  const extOk = ALLOWED_EXT.test(file.originalname);
  const mimeOk = ALLOWED_MIME.has(file.mimetype);
  if (!extOk || !mimeOk) {
    cb(new Error('Only JPG, JPEG, PNG, and PDF files are allowed'));
    return;
  }
  cb(null, true);
}

export const kycUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES, files: 4 },
});

export const kycUploadFields = kycUpload.fields([
  { name: 'doc_front', maxCount: 1 },
  { name: 'doc_back', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
  { name: 'address_proof', maxCount: 1 },
]);

export function storedFilePath(filename) {
  return path.join('uploads', 'kyc', filename).replace(/\\/g, '/');
}

export function removeUploadedFiles(files = {}) {
  Object.values(files).forEach((arr) => {
    (arr || []).forEach((f) => {
      if (f?.path) fs.unlink(f.path, () => {});
    });
  });
}
