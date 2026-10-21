import { User } from '../models/User.js';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { CashInPersonRequest } from '../models/CashInPersonRequest.js';
import { notifyCashInPersonRequest } from '../services/adminNotificationService.js';
import { assertUserMayWithdraw } from '../services/withdrawEligibilityService.js';
import { formatCashInPersonRequest, releaseCashInPersonWithdrawLock } from '../services/cashInPersonService.js';
import { releaseWithdrawalFunds } from '../services/withdrawalService.js';
import { withdrawableGteExpr } from '../services/walletBucketService.js';
import { fetchWalletSnapshotForUser } from '../services/walletSnapshotService.js';
import { roundMoney } from '../utils/money.js';
import { emitWalletUpdate } from '../services/socketService.js';
import { error, success } from '../utils/response.js';

export async function submitRequest(req, res, next) {
  try {
    const {
      mobile,
      city,
      amount,
      type,
      utrNumber,
      utr_number,
      bankName,
      bank_name,
      accountNumber,
      account_number,
      ifsc,
      accountHolder,
      account_holder,
    } = req.body;
    const requestType = type === 'withdraw' ? 'withdraw' : 'deposit';

    const finalUtr = String(utrNumber || utr_number || '').trim();
    const finalProof = req.proofPath || String(req.body.paymentProof || req.body.payment_proof || '').trim();
    const finalBankName = String(bankName || bank_name || '').trim();
    const finalAccountNumber = String(accountNumber || account_number || '').trim();
    const finalIfsc = String(ifsc || '').trim().toUpperCase();
    const finalAccountHolder = String(accountHolder || account_holder || '').trim();

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

    let debitedFromMain = false;
    let debitedAmount = 0;
    let createdTxId = null;

    if (requestType === 'withdraw') {
      // 1. Same gates as crypto/fiat withdraw — no spam requests without deposit/KYC/balance
      await assertUserMayWithdraw(req.userId, requestedAmount);

      // 2. Instant cut from main wallet and total balance
      const updatedWallet = await Wallet.findOneAndUpdate(
        {
          userId: req.userId,
          $expr: withdrawableGteExpr(requestedAmount),
        },
        {
          $inc: {
            mainBalance: -requestedAmount,
            balance: -requestedAmount,
          },
        },
        { new: true }
      );

      if (!updatedWallet) {
        return error(
          res,
          'Insufficient main wallet balance (referral/bonus balance cannot be withdrawn)',
          400
        );
      }

      debitedFromMain = true;
      debitedAmount = requestedAmount;

      // 3. Create a pending Transaction record so it reflects immediately in transaction log
      try {
        const tx = await Transaction.create({
          userId: req.userId,
          type: 'withdrawal',
          amount: requestedAmount,
          balanceAfter: roundMoney(updatedWallet.balance),
          currency: 'USDT',
          status: 'pending',
          method: 'fiat',
          reference: `Cash in person withdraw — ${String(city).trim()}`,
          adminNote: '',
        });
        createdTxId = tx._id;
      } catch (txErr) {
        console.warn('[cashInPerson] Failed to create pending transaction record:', txErr.message);
      }
    }

    let row;
    try {
      row = await CashInPersonRequest.create({
        userId: req.userId,
        type: requestType,
        mobile: String(mobile).trim(),
        city: String(city).trim(),
        requestedAmount,
        fundsLocked: false,
        fundsLockedAmount: 0,
        debitedFromMain,
        debitedAmount,
        transactionId: createdTxId,
        utrNumber: finalUtr,
        paymentProof: finalProof,
        bankName: finalBankName,
        accountNumber: finalAccountNumber,
        ifsc: finalIfsc,
        accountHolder: finalAccountHolder,
      });
    } catch (createErr) {
      if (debitedFromMain) {
        await Wallet.findOneAndUpdate(
          { userId: req.userId },
          { $inc: { mainBalance: debitedAmount, balance: debitedAmount } }
        ).catch(() => {});
        if (createdTxId) {
          await Transaction.findByIdAndDelete(createdTxId).catch(() => {});
        }
      }
      throw createErr;
    }

    // If withdraw request includes bank details, save them in the User document so they are remembered
    if (requestType === 'withdraw' && (finalBankName || finalAccountNumber || finalIfsc || finalAccountHolder)) {
      await User.findByIdAndUpdate(req.userId, {
        $set: {
          ...(finalBankName && { bankName: finalBankName }),
          ...(finalAccountNumber && { accountNumber: finalAccountNumber }),
          ...(finalIfsc && { ifsc: finalIfsc }),
          ...(finalAccountHolder && { accountHolder: finalAccountHolder }),
        },
      }).catch(() => {});
    }

    if (debitedFromMain) {
      await emitWalletUpdate(req.app.get('io'), req.userId, {
        reason: 'cash_in_person_withdraw_submit',
      }).catch(() => {});
    }

    void notifyCashInPersonRequest(req.app.get('io'), row);

    const walletSnapshot = await fetchWalletSnapshotForUser(req.userId).catch(() => null);

    return success(
      res,
      {
        ...formatCashInPersonRequest(row.toObject()),
        wallet: walletSnapshot,
      },
      requestType === 'withdraw'
        ? 'Withdraw request sent — funds have been instantly deducted from your main wallet'
        : 'Deposit request submitted — our team will verify your payment'
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
      .limit(100)
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

export async function cancelRequest(req, res, next) {
  try {
    const request = await CashInPersonRequest.findOne({
      _id: req.params.id,
      userId: req.userId,
      status: 'pending',
    });

    if (!request) {
      return error(res, 'Pending request not found', 404);
    }

    if (request.type === 'withdraw') {
      if (request.debitedFromMain) {
        const refundAmount = roundMoney(request.debitedAmount || request.requestedAmount || 0);
        if (refundAmount > 0) {
          await Wallet.findOneAndUpdate(
            { userId: req.userId },
            {
              $inc: {
                mainBalance: refundAmount,
                balance: refundAmount,
              },
            }
          );
        }
        if (request.transactionId) {
          await Transaction.findByIdAndUpdate(request.transactionId, {
            status: 'cancelled',
            adminNote: 'Cancelled by user',
          }).catch(() => {});
        }
      } else if (request.fundsLocked) {
        await releaseCashInPersonWithdrawLock(request);
      }
    }

    request.status = 'cancelled';
    request.adminNote = 'Cancelled by user';
    await request.save();

    await emitWalletUpdate(req.app.get('io'), req.userId, {
      reason: 'cash_in_person_withdraw_cancel',
    }).catch(() => {});

    const walletSnapshot = await fetchWalletSnapshotForUser(req.userId).catch(() => null);

    return success(
      res,
      {
        request: formatCashInPersonRequest(request.toObject()),
        wallet: walletSnapshot,
      },
      'Request cancelled and funds restored to your main wallet'
    );
  } catch (e) {
    return next(e);
  }
}
