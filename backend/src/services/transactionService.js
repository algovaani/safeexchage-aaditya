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

function depositStatusToTransactionStatus(status) {
  if (status === 'approved') return 'completed';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function withdrawalStatusToTransactionStatus(status) {
  if (status === 'approved') return 'completed';
  if (status === 'rejected') return 'rejected';
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

  for (const trade of trades) {
    const order = await Order.findById(trade.buyOrderId).select('side userId').lean();
    const side =
      order && String(order.userId) === String(userId)
        ? order.side
        : String(trade.buyerUserId) === String(userId)
          ? 'buy'
          : 'sell';
    const existing = await Transaction.findOne({ userId, spotTradeId: trade._id }).lean();
    if (existing) continue;

    const notional = trade.price * trade.quantity;
    const fee = trade.fee || 0;
    const amount = side === 'buy' ? notional + fee : notional - fee;

    await Transaction.create({
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
}

/** Pending spot order rows for open / partially filled orders missing from reports. */
export async function backfillOpenSpotOrderTransactions(userId) {
  const openOrders = await Order.find({
    userId,
    status: { $in: ['open', 'partially_filled'] },
  })
    .sort({ createdAt: -1 })
    .lean();

  for (const order of openOrders) {
    const existing = await Transaction.findOne({ userId, spotOrderId: order._id }).lean();
    if (existing) continue;

    const estPrice = order.price || order.avgFillPrice || 0;
    const notional = estPrice * order.quantity;
    const amount = order.side === 'buy' ? notional * 1.001 : notional * 0.999;

    await Transaction.create({
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
}

/** Show legacy registration/demo wallet credit when no deposit records exist. */
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

export async function rejectLinkedTransaction(record, note = '') {
  if (!record?.transactionId) return null;
  return Transaction.findByIdAndUpdate(
    record.transactionId,
    {
      status: 'rejected',
      adminNote: note?.trim() || '',
    },
    { new: true }
  );
}
