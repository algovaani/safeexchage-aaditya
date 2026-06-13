import { Router } from 'express';
import multer from 'multer';
import * as kyc from '../controllers/kycController.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { kycUploadFields, removeUploadedFiles } from '../middleware/kycUpload.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { submitKycValidators } from '../validators/kycValidators.js';
import { error } from '../utils/response.js';

const r = Router();

function handleKycUpload(req, res, next) {
  kycUploadFields(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      removeUploadedFiles(req.files);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return error(res, 'File too large. Maximum size is 5MB per file.', 400);
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return error(res, 'Unexpected file field uploaded', 400);
      }
      return error(res, err.message, 400);
    }
    if (err) {
      removeUploadedFiles(req.files);
      return error(res, err.message, 400);
    }
    return next();
  });
}

r.post('/submit', authMiddleware, handleKycUpload, submitKycValidators, validateRequest, kyc.submit);
r.get('/status', authMiddleware, kyc.status);

export default r;
