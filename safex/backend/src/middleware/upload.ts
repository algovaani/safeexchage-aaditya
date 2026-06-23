import multer from 'multer';

const ALLOWED = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, PDF allowed'));
  },
});
