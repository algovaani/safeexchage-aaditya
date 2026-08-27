import { CashInPersonRequest } from '../models/CashInPersonRequest.js';
import { notifyCashInPersonRequest } from '../services/adminNotificationService.js';
import { assertUserMayWithdraw } from '../services/withdrawEligibilityService.js';
import { formatCashInPersonRequest } from '../services/cashInPersonService.js';
import { reserveWithdrawalFunds, releaseWithdrawalFunds } from '../services/withdrawalService.js';
import { roundMoney } from '../utils/money.js';
import { emitWalletUpdate } from '../services/socketService.js';
import { error, success } from '../utils/response.js';

export async function submitRequest(req, res, next) {
  try {
    const { mobile, city, amount, type } = req.body;
    const requestType = type === 'withdraw' ? 'withdraw' : 'deposit';
    const existing = await CashInPersonRequest.findOne({
      userId: req.userId,
      status: 'pending',
      type: requestType,
    }).lean();

    if (existing) {
      return error(res, `You already have a pending cash-in-person ${requestType} request`, 400);
    }

    const requestedAmount =
      amount != null && amount !== '' && Number.isFinite(Number(amount)) && Number(amount) > 0
        ? roundMoney(Number(amount))
        : null;

    if (requestType === 'withdraw' && !(requestedAmount > 0)) {
      return error(res, 'Amount is required for withdraw requests', 400);
    }

    let fundsLocked = false;
    let fundsLockedAmount = 0;

    if (requestType === 'withdraw') {
      // Same gates as crypto/fiat withdraw — no spam requests without deposit/KYC/balance
      await assertUserMayWithdraw(req.userId, requestedAmount);
      await reserveWithdrawalFunds(req.userId, requestedAmount);
      fundsLocked = true;
      fundsLockedAmount = requestedAmount;
    }

    let row;
    try {
      row = await CashInPersonRequest.create({
        userId: req.userId,
        type: requestType,
        mobile: String(mobile).trim(),
        city: String(city).trim(),
        requestedAmount,
        fundsLocked,
        fundsLockedAmount,
      });
    } catch (createErr) {
      if (fundsLocked) {
        await releaseWithdrawalFunds(req.userId, fundsLockedAmount).catch(() => {});
      }
      throw createErr;
    }

    if (fundsLocked) {
      await emitWalletUpdate(req.app.get('io'), req.userId, {
        reason: 'cash_in_person_withdraw_lock',
      }).catch(() => {});
    }

    void notifyCashInPersonRequest(req.app.get('io'), row);

    return success(
      res,
      formatCashInPersonRequest(row.toObject()),
      'Request submitted — our team will contact you shortly'
    );
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function myRequests(req, res, next) {
  try {
    const rows = await CashInPersonRequest.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return success(
      res,
      rows.map((r) => formatCashInPersonRequest(r)),
      'Cash in person requests fetched'
    );
  } catch (e) {
    return next(e);
  }
}
