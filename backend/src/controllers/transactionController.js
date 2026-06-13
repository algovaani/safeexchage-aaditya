import mongoose from 'mongoose';
import { Transaction } from '../models/Transaction.js';
import { success } from '../utils/response.js';
import { roundMoney } from '../utils/money.js';
import { transactionTypesForFilter } from '../utils/transactionTypes.js';

function formatTransaction(tx) {
  return {
    id: tx._id,
    type: tx.type,
    amount: roundMoney(tx.amount),
    balance_after: tx.balanceAfter != null ? roundMoney(tx.balanceAfter) : null,
    currency: tx.currency || 'USDT',
    status: tx.status,
    date: tx.createdAt,
    reference: tx.reference || null,
  };
}

export async function listTransactions(req, res, next) {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const skip = (page - 1) * limit;

    const filter = { userId: new mongoose.Types.ObjectId(req.userId) };
    const types = transactionTypesForFilter(req.query.type);
    if (types) {
      filter.type = { $in: types };
    }

    const [items, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Transaction.countDocuments(filter),
    ]);

    return success(res, {
      items: items.map(formatTransaction),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    }, 'Transactions fetched');
  } catch (e) {
    return next(e);
  }
}
