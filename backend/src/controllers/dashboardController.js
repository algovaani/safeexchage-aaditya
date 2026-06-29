import mongoose from 'mongoose';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { UserOrder } from '../models/UserOrder.js';
import { AdminTrade } from '../models/AdminTrade.js';
import { UserStake } from '../models/UserStake.js';
import { StakingPlan } from '../models/StakingPlan.js';
import { fetchPriceMap } from '../services/coingeckoService.js';
import { calculatePnL } from '../services/settlementService.js';
import { success } from '../utils/response.js';
import { roundMoney } from '../utils/money.js';
import {
  calculateEarnedSoFar,
  daysBetween,
  startOfDay,
} from '../utils/stakingMath.js';

function formatTradeSummary(trade, pair) {
  return {
    id: trade._id,
    pair: pair?.displayPair || pair?.symbol || null,
    symbol: pair?.symbol || null,
    entry_price: roundMoney(trade.entryPrice),
    take_profit: roundMoney(trade.takeProfit),
    stop_loss: roundMoney(trade.stopLoss),
    leverage: trade.leverage,
    status: trade.status,
  };
}

async function sumTransactions(userId, type, statuses = ['completed']) {
  const rows = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        type,
        status: { $in: statuses },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return rows[0]?.total || 0;
}

export async function getSummary(req, res, next) {
  try {
    const userId = req.userId;

    const [wallet, totalDeposited, totalWithdrawnRaw, openPositionsCount, pnlRows, stakeRows] =
      await Promise.all([
        Wallet.findOne({ userId }).lean(),
        sumTransactions(userId, 'deposit'),
        sumTransactions(userId, 'withdrawal', ['completed', 'approved']),
        UserOrder.countDocuments({ userId, status: 'open' }),
        UserOrder.aggregate([
          {
            $match: {
              userId: new mongoose.Types.ObjectId(userId),
              status: 'closed',
            },
          },
          { $group: { _id: null, total: { $sum: '$pnl' } } },
        ]),
        UserStake.aggregate([
          {
            $match: {
              userId: new mongoose.Types.ObjectId(userId),
              status: { $in: ['active', 'matured'] },
            },
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              total: { $sum: '$amount' },
            },
          },
        ]),
      ]);

    const totalPnl = pnlRows[0]?.total || 0;
    const stakeStats = stakeRows[0] || { count: 0, total: 0 };

    return success(res, {
      wallet: {
        balance_usdt: roundMoney(wallet?.balance || 0),
        locked_balance: roundMoney(wallet?.lockedBalance || 0),
      },
      stats: {
        total_deposited: roundMoney(totalDeposited),
        total_withdrawn: roundMoney(Math.abs(totalWithdrawnRaw)),
        open_positions_count: openPositionsCount,
        total_pnl: roundMoney(totalPnl),
        active_stakes_count: stakeStats.count,
        total_staked: roundMoney(stakeStats.total),
      },
    }, 'Dashboard summary fetched');
  } catch (e) {
    return next(e);
  }
}

export async function getPortfolio(req, res, next) {
  try {
    const userId = req.userId;

    const [openOrders, closedOrders, activeStakes, recentTx] = await Promise.all([
      UserOrder.find({ userId, status: 'open' }).sort({ createdAt: -1 }).lean(),
      UserOrder.find({ userId, status: { $in: ['closed', 'cancelled'] } })
        .sort({ closedAt: -1, createdAt: -1 })
        .limit(20)
        .lean(),
      UserStake.find({ userId, status: { $in: ['active', 'matured', 'pending'] } })
        .sort({ createdAt: -1 })
        .lean(),
      Transaction.find({ userId }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    const tradeIds = [
      ...new Set([
        ...openOrders.map((o) => String(o.tradeId)),
        ...closedOrders.map((o) => String(o.tradeId)),
      ]),
    ];
    const [trades, plans, priceData] = await Promise.all([
      AdminTrade.find({ _id: { $in: tradeIds } }).populate('pairId').lean(),
      StakingPlan.find({
        _id: { $in: [...new Set(activeStakes.map((s) => s.planId))] },
      }).lean(),
      fetchPriceMap(),
    ]);

    const tradeMap = new Map(trades.map((t) => [String(t._id), t]));
    const planMap = new Map(plans.map((p) => [String(p._id), p]));
    const { prices, stale } = priceData;
    const today = startOfDay();

    const open_positions = openOrders.map((order) => {
      const trade = tradeMap.get(String(order.tradeId));
      const pair = trade?.pairId;
      const symbol = pair?.symbol;
      const currentPrice = symbol ? prices[symbol] ?? trade?.entryPrice : trade?.entryPrice;
      const { pnl, pnl_percent } = calculatePnL(
        order.entryPrice,
        currentPrice,
        order.marginAmount,
        trade?.leverage || 1
      );

      return {
        order_id: order._id,
        margin_amount: roundMoney(order.marginAmount),
        entry_price: roundMoney(order.entryPrice),
        current_price: roundMoney(currentPrice),
        unrealized_pnl: pnl,
        unrealized_pnl_percent: pnl_percent,
        opened_at: order.createdAt,
        trade: trade ? formatTradeSummary(trade, pair) : null,
        price_stale: stale,
      };
    });

    const closed_positions = closedOrders.map((order) => {
      const trade = tradeMap.get(String(order.tradeId));
      const pair = trade?.pairId;
      return {
        order_id: order._id,
        status: order.status,
        margin_amount: roundMoney(order.marginAmount),
        entry_price: roundMoney(order.entryPrice),
        close_price: order.closePrice != null ? roundMoney(order.closePrice) : null,
        pnl: roundMoney(order.pnl),
        closed_at: order.closedAt,
        trade: trade ? formatTradeSummary(trade, pair) : null,
      };
    });

    const active_stakes = activeStakes.map((stake) => {
      const plan = planMap.get(String(stake.planId));
      const daysElapsed = daysBetween(stake.startDate, today);
      const daysRemaining = Math.max(0, daysBetween(today, stake.maturityDate));
      const earnedSoFar = calculateEarnedSoFar(
        stake.amount,
        stake.apyPercent,
        stake.lockDays,
        daysElapsed
      );

      return {
        id: stake._id,
        plan_name: plan?.name || null,
        amount: roundMoney(stake.amount),
        apy_percent: roundMoney(stake.apyPercent),
        status: stake.status,
        start_date: stake.startDate,
        maturity_date: stake.maturityDate,
        days_remaining: daysRemaining,
        earned_so_far: roundMoney(earnedSoFar),
        reward_earned: roundMoney(stake.rewardEarned),
      };
    });

    const recent_transactions = recentTx.map((tx) => ({
      id: tx._id,
      type: tx.type,
      amount: roundMoney(tx.amount),
      balance_after: tx.balanceAfter != null ? roundMoney(tx.balanceAfter) : null,
      date: tx.createdAt,
      status: tx.status,
    }));

    return success(res, {
      open_positions,
      closed_positions,
      active_stakes,
      recent_transactions,
    }, 'Portfolio fetched');
  } catch (e) {
    return next(e);
  }
}
