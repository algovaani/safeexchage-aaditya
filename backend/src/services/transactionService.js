import { Deposit } from '../models/Deposit.js';
import { Order } from '../models/Order.js';
import { Trade } from '../models/Trade.js';
import { Transaction } from '../models/Transaction.js';
import { Wallet } from '../models/Wallet.js';
import { Withdrawal } from '../models/Withdrawal.js';
import {
  computeDepositUsdtCredit,
  depositCreditReference,
  isNativeCryptoDeposit,
} from './depositConversionService.js';
import { roundMoney } from '../utils/money.js';

/** Skip repeat legacy backfill work after a user has been synced once this process. */
const reportsBackfillDone = new Set();

function depositStatusToTransactionStatus(status) {
  if (status === 'approved') return 'completed';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function withdrawalStatusToTransactionStatus(status) {
  if (status === 'approved') return 'completed';
  if (status === 'rejected') return 'rejected';
  if (status === 'cancelled') return 'cancelled';
  return 'pending';
}

/** Create Transaction rows for deposits/withdrawals that predate transaction linking. */
export async function backfillOrphanFinancialRecords(userId) {
  const [deposits, withdrawals] = await Promise.all([
    Deposit.find({ userId, transactionId: null }).lean(),
    Withdrawal.find({ userId, transactionId: null }).lean(),
  ]);

  for (const deposit of deposits) {
    const method = deposit.type === 'crypto' ? 'crypto' : 'fiat';
    let usdtAmount = deposit.usdtAmount;
    let conversionRate = deposit.conversionRate;
    if (usdtAmount == null) {
      try {
        const conversion = await computeDepositUsdtCredit(deposit);
        usdtAmount = conversion.usdtAmount;
        conversionRate = conversion.conversionRate;
        await Deposit.updateOne(
          { _id: deposit._id },
          { usdtAmount, conversionRate }
        );
      } catch {
        usdtAmount = deposit.amount;
        conversionRate = 1;
      }
    }
    deposit.usdtAmount = usdtAmount;
    deposit.conversionRate = conversionRate;
    const reference = depositCreditReference(deposit);
    const transaction = await Transaction.create({
      userId: deposit.userId,
      type: 'deposit',
      amount: usdtAmount,
      currency: 'USDT',
      status: depositStatusToTransactionStatus(deposit.status),
      method,
      reference,
      depositId: deposit._id,
      adminNote: deposit.adminNote || '',
      createdAt: deposit.createdAt,
      updatedAt: deposit.updatedAt,
    });
    await Deposit.updateOne({ _id: deposit._id }, { transactionId: transaction._id });
  }

  for (const withdrawal of withdrawals) {
    const method = withdrawal.type === 'crypto' ? 'crypto' : 'fiat';
    const reference =
      withdrawal.type === 'crypto'
        ? withdrawal.walletAddress
        : withdrawal.accountNumber || String(withdrawal._id);
    const transaction = await Transaction.create({
      userId: withdrawal.userId,
      type: 'withdrawal',
      amount: withdrawal.amount,
      currency: withdrawal.currency || 'USDT',
      status: withdrawalStatusToTransactionStatus(withdrawal.status),
      method,
      reference: reference || '',
      withdrawalId: withdrawal._id,
      adminNote: withdrawal.adminNote || '',
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
    });
    await Withdrawal.updateOne({ _id: withdrawal._id }, { transactionId: transaction._id });
  }
}

/** Create report rows for spot trades that filled before transaction logging existed. */
export async function backfillSpotTradeTransactions(userId) {
  const trades = await Trade.find({
    $or: [{ buyerUserId: userId }, { sellerUserId: userId }],
  })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  if (!trades.length) return;

  const tradeIds = trades.map((t) => t._id);
  const existing = await Transaction.find({
    userId,
    spotTradeId: { $in: tradeIds },
  })
    .select('spotTradeId')
    .lean();
  const existingIds = new Set(existing.map((row) => String(row.spotTradeId)));
  const missing = trades.filter((t) => !existingIds.has(String(t._id)));
  if (!missing.length) return;

  const orderIds = [...new Set(missing.map((t) => t.buyOrderId).filter(Boolean))];
  const orders = orderIds.length
    ? await Order.find({ _id: { $in: orderIds } })
        .select('side userId')
        .lean()
    : [];
  const orderById = new Map(orders.map((o) => [String(o._id), o]));

  const docs = [];
  for (const trade of missing) {
    const order = orderById.get(String(trade.buyOrderId));
    const side =
      order && String(order.userId) === String(userId)
        ? order.side
        : String(trade.buyerUserId) === String(userId)
          ? 'buy'
          : 'sell';
    const notional = trade.price * trade.quantity;
    const fee = trade.fee || 0;
    const amount = side === 'buy' ? notional + fee : notional - fee;

    docs.push({
      userId,
      type: side === 'buy' ? 'spot_buy' : 'spot_sell',
      amount: roundMoney(amount),
      balanceAfter: null,
      currency: 'USDT',
      status: 'completed',
      method: 'gateway',
      reference: `${trade.symbol} ${side} ${trade.quantity} @ ${trade.price}`,
      spotTradeId: trade._id,
      createdAt: trade.createdAt,
      updatedAt: trade.updatedAt,
    });
  }

  if (docs.length) {
    await Transaction.insertMany(docs, { ordered: false });
  }
}

/** Pending spot order rows for open / partially filled orders missing from reports. */
export async function backfillOpenSpotOrderTransactions(userId) {
  const openOrders = await Order.find({
    userId,
    status: { $in: ['open', 'partially_filled'] },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!openOrders.length) return;

  const orderIds = openOrders.map((o) => o._id);
  const existing = await Transaction.find({
    userId,
    spotOrderId: { $in: orderIds },
  })
    .select('spotOrderId')
    .lean();
  const existingIds = new Set(existing.map((row) => String(row.spotOrderId)));

  const docs = [];
  for (const order of openOrders) {
    if (existingIds.has(String(order._id))) continue;

    const estPrice = order.price || order.avgFillPrice || 0;
    const notional = estPrice * order.quantity;
    const amount = order.side === 'buy' ? notional * 1.001 : notional * 0.999;

    docs.push({
      userId,
      type: order.side === 'buy' ? 'spot_buy' : 'spot_sell',
      amount: roundMoney(amount || 0),
      currency: 'USDT',
      status: 'pending',
      method: 'gateway',
      reference: `${order.symbol} ${order.side} ${order.quantity} (${order.orderType})`,
      spotOrderId: order._id,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    });
  }

  if (docs.length) {
    await Transaction.insertMany(docs, { ordered: false });
  }
}

/** Show legacy registration/demo wallet credit when no deposit records exist. */
async function needsTransactionBackfill(userId) {
  const [orphanDeposit, orphanWithdrawal, openOrder] = await Promise.all([
    Deposit.exists({ userId, transactionId: null }),
    Withdrawal.exists({ userId, transactionId: null }),
    Order.exists({ userId, status: { $in: ['open', 'partially_filled'] } }),
  ]);
  if (orphanDeposit || orphanWithdrawal) return true;

  const recentTrades = await Trade.find({
    $or: [{ buyerUserId: userId }, { sellerUserId: userId }],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .select('_id')
    .lean();
  if (recentTrades.length) {
    const tradeIds = recentTrades.map((t) => t._id);
    const linkedTrades = await Transaction.countDocuments({
      userId,
      spotTradeId: { $in: tradeIds },
    });
    if (linkedTrades < tradeIds.length) return true;
  }

  if (openOrder) {
    const orders = await Order.find({
      userId,
      status: { $in: ['open', 'partially_filled'] },
    })
      .select('_id')
      .limit(20)
      .lean();
    if (orders.length) {
      const orderIds = orders.map((o) => o._id);
      const linkedOrders = await Transaction.countDocuments({
        userId,
        spotOrderId: { $in: orderIds },
      });
      if (linkedOrders < orderIds.length) return true;
    }
  }

  const [txCount, depositCount, withdrawalCount] = await Promise.all([
    Transaction.countDocuments({ userId }),
    Deposit.countDocuments({ userId }),
    Withdrawal.countDocuments({ userId }),
  ]);
  if (txCount === 0 && depositCount === 0 && withdrawalCount === 0) {
    const wallet = await Wallet.findOne({ userId }).select('balance').lean();
    if (wallet?.balance > 0) return true;
  }

  return false;
}

/** Run legacy report backfill once per user (fast no-op on repeat visits). */
export async function ensureUserTransactionReports(userId) {
  const key = String(userId);
  if (reportsBackfillDone.has(key)) return;

  if (!(await needsTransactionBackfill(userId))) {
    reportsBackfillDone.add(key);
    return;
  }

  await backfillOrphanFinancialRecords(userId);
  await backfillSpotTradeTransactions(userId);
  await backfillOpenSpotOrderTransactions(userId);
  await ensureOpeningBalanceTransaction(userId);
  reportsBackfillDone.add(key);
}

export async function ensureOpeningBalanceTransaction(userId) {
  const wallet = await Wallet.findOne({ userId }).lean();
  if (!wallet || wallet.balance <= 0) return;

  const [txCount, depositCount, withdrawalCount] = await Promise.all([
    Transaction.countDocuments({ userId }),
    Deposit.countDocuments({ userId }),
    Withdrawal.countDocuments({ userId }),
  ]);

  if (txCount > 0 || depositCount > 0 || withdrawalCount > 0) return;

  await Transaction.create({
    userId,
    type: 'deposit',
    amount: roundMoney(wallet.balance),
    balanceAfter: roundMoney(wallet.balance),
    currency: wallet.currency || 'USDT',
    status: 'completed',
    method: 'manual',
    reference: 'Account balance',
  });
}

export async function createPendingDepositTransaction(deposit) {
  const method = deposit.type === 'crypto' ? 'crypto' : 'fiat';
  const creditNativeAsset = isNativeCryptoDeposit(deposit);
  const currency = String(deposit.currency || 'USDT').toUpperCase();
  const amount = creditNativeAsset ? roundMoney(deposit.amount) : roundMoney(deposit.usdtAmount ?? deposit.amount);
  const txCurrency = creditNativeAsset ? currency : 'USDT';
  const reference = depositCreditReference(deposit);

  const transaction = await Transaction.create({
    userId: deposit.userId,
    type: 'deposit',
    amount,
    currency: txCurrency,
    status: 'pending',
    method,
    reference,
    depositId: deposit._id,
  });

  deposit.transactionId = transaction._id;
  await deposit.save();

  return transaction;
}

export async function createPendingWithdrawalTransaction(withdrawal) {
  const method = withdrawal.type === 'crypto' ? 'crypto' : 'fiat';
  const reference =
    withdrawal.type === 'crypto'
      ? withdrawal.walletAddress
      : withdrawal.accountNumber || String(withdrawal._id);

  const transaction = await Transaction.create({
    userId: withdrawal.userId,
    type: 'withdrawal',
    amount: withdrawal.amount,
    currency: withdrawal.currency || 'USDT',
    status: 'pending',
    method,
    reference: reference || '',
    withdrawalId: withdrawal._id,
  });

  withdrawal.transactionId = transaction._id;
  await withdrawal.save();

  return transaction;
}

export async function completeLinkedTransaction(
  record,
  { balanceAfter, status = 'completed', amount, currency, reference } = {}
) {
  if (!record?.transactionId) return null;
  const update = {
    status,
    balanceAfter: balanceAfter != null ? roundMoney(balanceAfter) : null,
  };
  if (amount != null) update.amount = roundMoney(amount);
  if (currency) update.currency = currency;
  if (reference) update.reference = reference;
  return Transaction.findByIdAndUpdate(record.transactionId, update, { new: true });
}

export async function rejectLinkedTransaction(record, note = '', status = 'rejected') {
  if (!record?.transactionId) return null;
  return Transaction.findByIdAndUpdate(
    record.transactionId,
    {
      status,
      adminNote: note?.trim() || '',
    },
    { new: true }
  );
}
