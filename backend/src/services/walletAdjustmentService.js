import mongoose from 'mongoose';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { User } from '../models/User.js';
import { roundMoney, storeMoney } from '../utils/money.js';

function walletAvailable(wallet) {
  return storeMoney((wallet?.balance || 0) - (wallet?.lockedBalance || 0));
}

export function formatWalletSnapshot(wallet, assets = []) {
  const balance = roundMoney(wallet?.balance || 0);
  const locked = roundMoney(wallet?.lockedBalance || 0);
  const available = roundMoney(Math.max(0, (wallet?.balance || 0) - (wallet?.lockedBalance || 0)));
  return {
    balance_usdt: balance,
    balance,
    locked_balance: locked,
    available_balance: available,
    currency: wallet?.currency || 'USDT',
    assets,
  };
}

export async function adjustUserWalletBalance({
  userId,
  adminId,
  action,
  amount,
  remark,
}) {
  const normalizedAction = action === 'add' ? 'add' : 'deduct';
  const value = storeMoney(amount);
  if (!(value > 0)) {
    throw Object.assign(new Error('Amount must be greater than zero'), { status: 400 });
  }

  const note = String(remark || '').trim();
  if (!note) {
    throw Object.assign(new Error('Remark is required'), { status: 400 });
  }

  const user = await User.findById(userId).select('_id email mobile name role');
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let wallet = await Wallet.findOne({ userId }).session(session);
    if (!wallet) {
      [wallet] = await Wallet.create([{ userId, balance: 0, lockedBalance: 0, currency: 'USDT' }], {
        session,
      });
    }

    if (normalizedAction === 'deduct') {
      const available = walletAvailable(wallet);
      if (available + 1e-10 < value) {
        throw Object.assign(
          new Error(
            `Insufficient available USDT balance (available: ${roundMoney(available)}, locked: ${roundMoney(wallet.lockedBalance || 0)})`
          ),
          { status: 400 }
        );
      }
    }

    if (normalizedAction === 'add') {
      wallet.balance = storeMoney(wallet.balance + value);
    } else {
      wallet.balance = storeMoney(wallet.balance - value);
    }

    const txType = normalizedAction === 'add' ? 'admin_credit' : 'admin_debit';
    const txAmount = normalizedAction === 'add' ? value : value;

    const [transaction] = await Transaction.create(
      [
        {
          userId,
          type: txType,
          amount: roundMoney(txAmount),
          balanceAfter: roundMoney(wallet.balance),
          currency: 'USDT',
          status: 'completed',
          method: 'manual',
          reference: `admin_${normalizedAction}:${adminId}`,
          adminNote: note,
        },
      ],
      { session }
    );

    await wallet.save({ session });
    await session.commitTransaction();

    return {
      user: {
        id: user._id,
        email: user.email,
        mobile: user.mobile,
        name: user.name,
      },
      transaction: {
        id: transaction._id,
        type: transaction.type,
        amount: roundMoney(transaction.amount),
        balance_after: roundMoney(wallet.balance),
        remark: note,
        created_at: transaction.createdAt,
      },
      ...formatWalletSnapshot(wallet),
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export function formatFundAdjustment(tx) {
  return {
    id: tx._id,
    type: tx.type,
    action: tx.type === 'admin_credit' ? 'add' : 'deduct',
    amount: roundMoney(tx.amount),
    balance_after: tx.balanceAfter != null ? roundMoney(tx.balanceAfter) : null,
    remark: tx.adminNote || '',
    date: tx.createdAt,
    status: tx.status,
  };
}
