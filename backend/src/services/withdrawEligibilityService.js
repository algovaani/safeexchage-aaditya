import { Deposit } from '../models/Deposit.js';
import { CashInPersonRequest } from '../models/CashInPersonRequest.js';
import { Withdrawal } from '../models/Withdrawal.js';
import { KycSubmission } from '../models/KycSubmission.js';
import { Transaction } from '../models/Transaction.js';
import { Wallet } from '../models/Wallet.js';
import { roundMoney } from '../utils/money.js';
import { withdrawableBalance } from './walletAdjustmentService.js';

const MIN_WITHDRAW = Number(process.env.WITHDRAW_MIN_AMOUNT) || 1;
const MAX_WITHDRAW = Number(process.env.WITHDRAW_MAX_AMOUNT) || 100_000;
const MAX_PENDING = Number(process.env.WITHDRAW_MAX_PENDING) || 3;
const REQUIRE_KYC = process.env.WITHDRAW_REQUIRE_KYC !== '0';
const REQUIRE_FUNDING = process.env.WITHDRAW_REQUIRE_FUNDING !== '0';

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

/**
 * True when the user has received real platform funding
 * (approved deposit, cash-in-person deposit, or admin wallet credit).
 * Referral / trading bonus alone does NOT count.
 */
export async function userHasRealFunding(userId) {
  const [deposit, cashIn, adminCredit] = await Promise.all([
    Deposit.exists({ userId, status: 'approved' }),
    CashInPersonRequest.exists({ userId, type: 'deposit', status: 'approved' }),
    Transaction.exists({ userId, type: 'admin_credit', status: 'completed' }),
  ]);
  return Boolean(deposit || cashIn || adminCredit);
}

export async function userHasApprovedKyc(userId) {
  return Boolean(await KycSubmission.exists({ userId, status: 'approved' }));
}

export async function countPendingWithdrawals(userId) {
  const [w, cash] = await Promise.all([
    Withdrawal.countDocuments({ userId, status: 'pending' }),
    CashInPersonRequest.countDocuments({ userId, type: 'withdraw', status: 'pending' }),
  ]);
  return w + cash;
}

/**
 * Hard gate before any withdraw request is created.
 * Call BEFORE locking funds.
 */
export async function assertUserMayWithdraw(userId, amount) {
  const parsed = roundMoney(amount);
  if (!(parsed > 0)) {
    throw httpError('Invalid withdrawal amount');
  }
  if (parsed + 1e-12 < MIN_WITHDRAW) {
    throw httpError(`Minimum withdrawal is ${MIN_WITHDRAW} USDT`);
  }
  if (parsed - 1e-12 > MAX_WITHDRAW) {
    throw httpError(`Maximum withdrawal is ${MAX_WITHDRAW} USDT per request`);
  }

  if (REQUIRE_KYC) {
    const kycOk = await userHasApprovedKyc(userId);
    if (!kycOk) {
      throw httpError('Complete and get KYC approved before withdrawing', 403);
    }
  }

  if (REQUIRE_FUNDING) {
    const funded = await userHasRealFunding(userId);
    if (!funded) {
      throw httpError(
        'Withdrawal not allowed: no approved deposit found. Deposit funds first, then withdraw.',
        403
      );
    }
  }

  const pending = await countPendingWithdrawals(userId);
  if (pending >= MAX_PENDING) {
    throw httpError(
      `You already have ${pending} pending withdrawal request(s). Wait for them to finish.`,
      429
    );
  }

  const wallet = await Wallet.findOne({ userId }).lean();
  const available = withdrawableBalance(wallet);
  if (available + 1e-10 < parsed) {
    throw httpError(
      `Insufficient withdrawable balance (available: ${roundMoney(available)} USDT). Referral bonus cannot be withdrawn.`,
      400
    );
  }

  return { amount: parsed, withdrawable: available, wallet };
}

export const withdrawPolicy = {
  MIN_WITHDRAW,
  MAX_WITHDRAW,
  MAX_PENDING,
  REQUIRE_KYC,
  REQUIRE_FUNDING,
};
