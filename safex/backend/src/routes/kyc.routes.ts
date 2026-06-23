import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { submitKyc, getKycStatus } from '../services/kyc.service.js';
import type { AuthRequest } from '../utils/response.js';
import { fail, success } from '../utils/response.js';
import { DocType } from '@prisma/client';

const router = Router();

router.post(
  '/submit',
  authMiddleware,
  upload.fields([
    { name: 'documentFront', maxCount: 1 },
    { name: 'documentBack', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
    { name: 'addressProof', maxCount: 1 },
  ]),
  async (req: AuthRequest, res) => {
    try {
      const documentType = req.body.documentType as DocType;
      if (!documentType) return fail(res, 'documentType required');
      const files = req.files as Record<string, Express.Multer.File[]>;
      const mapped = {
        documentFront: files.documentFront?.[0],
        documentBack: files.documentBack?.[0],
        selfie: files.selfie?.[0],
        addressProof: files.addressProof?.[0],
      };
      const kyc = await submitKyc(req.userId!, documentType, mapped);
      return success(res, kyc, 'KYC submitted');
    } catch (e: unknown) {
      return fail(res, e instanceof Error ? e.message : 'KYC submit failed', 400);
    }
  }
);

router.get('/status', authMiddleware, async (req: AuthRequest, res) => {
  const data = await getKycStatus(req.userId!);
  return success(res, data, 'KYC status');
});

export default router;
