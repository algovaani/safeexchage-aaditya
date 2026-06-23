import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import {
  createCryptoDeposit,
  createFiatDeposit,
  myDeposits,
} from '../services/deposit.service.js';
import { getSettings } from '../services/admin.service.js';
import type { AuthRequest } from '../utils/response.js';
import { fail, success } from '../utils/response.js';

const router = Router();

router.get('/platform-info', authMiddleware, async (_req, res) => {
  const settings = await getSettings();
  return success(res, settings, 'Platform deposit info');
});

router.post('/crypto', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { txHash, amount, walletAddress } = req.body;
    if (!txHash || !amount) return fail(res, 'txHash and amount required');
    const deposit = await createCryptoDeposit(req.userId!, {
      txHash,
      amount: Number(amount),
      walletAddress: walletAddress || process.env.PLATFORM_USDT_ADDRESS || '',
    });
    return success(res, deposit, 'Crypto deposit submitted', 201);
  } catch (e: unknown) {
    return fail(res, e instanceof Error ? e.message : 'Failed', 400);
  }
});

router.post(
  '/fiat',
  authMiddleware,
  upload.single('paymentProof'),
  async (req: AuthRequest, res) => {
    try {
      const { amount, bankName, accountNumber, utrNumber } = req.body;
      const deposit = await createFiatDeposit(
        req.userId!,
        {
          amount: Number(amount),
          bankName,
          accountNumber,
          utrNumber,
        },
        req.file
      );
      return success(res, deposit, 'Fiat deposit submitted', 201);
    } catch (e: unknown) {
      return fail(res, e instanceof Error ? e.message : 'Failed', 400);
    }
  }
);

router.get('/my', authMiddleware, async (req: AuthRequest, res) => {
  const deposits = await myDeposits(req.userId!);
  return success(res, deposits, 'Deposits fetched');
});

export default router;
