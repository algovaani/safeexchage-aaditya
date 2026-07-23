import mongoose from 'mongoose';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { UserOrder } from '../models/UserOrder.js';
import { AdminTrade } from '../models/AdminTrade.js';
import { UserStake } from '../models/UserStake.js';
import { StakingPlan } from '../models/StakingPlan.js';
import { FuturesPosition } from '../models/FuturesPosition.js';
import { listUserAssets } from '../services/assetBalanceService.js';
import { fetchAllPairPrices, fetchPriceMap } from '../services/marketDataProvider.js';
import { listOpenPositions } from '../services/futuresService.js';
import { getPlatformSettings } from '../services/platformSettingsService.js';
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

/** Holding P&L vs 24h open using live last price (USDT). */
function spotHoldingPnlUsdt(asset, qty, liveBySymbol, usdtInrRate) {
  const sym = String(asset || '').toUpperCase();
  if (!sym || sym === 'USDT' || !(qty > 0)) return 0;

  const usdtRow = liveBySymbol.get(`${sym}USDT`);
  const inrRow = liveBySymbol.get(`${sym}INR`);
  const row = usdtRow || inrRow;
  if (!row) return 0;

  let px = Number(row.price ?? row.lastPrice);
  let open = Number(row.open_24h);
  const changePct = Number(row.change_24h);

  // INR-quoted commodities → convert to USDT
  if (!usdtRow && inrRow && usdtInrRate > 0) {
    if (Number.isFinite(px) && px > 0) px /= usdtInrRate;
    if (Number.isFinite(open) && open > 0) open /= usdtInrRate;
  }

  if (!(px > 0)) return 0;

  if (Number.isFinite(open) && open > 0) {
    return qty * (px - open);
  }
  if (Number.isFinite(changePct)) {
    const factor = 1 + changePct / 100;
    if (factor > 0) return qty * px * (1 - 1 / factor);
  }
  return 0;
}

export async function getSummary(req, res, next) {
  try {
    const userId = req.userId;
    const dayStart = startOfDay();

    const [
      wallet,
      assets,
      livePrices,
      settings,
      totalDeposited,
      totalWithdrawnRaw,
      binaryOpenCount,
      futuresOpenCount,
      realizedTodayRows,
      futuresRealizedTodayRows,
      stakeRows,
    ] = await Promise.all([
      Wallet.findOne({ userId }).lean(),
      listUserAssets(userId).catch(() => []),
      fetchAllPairPrices().catch(() => ({ pairs: [] })),
      getPlatformSettings().catch(() => ({ usdtInrRate: 83.5 })),
      sumTransactions(userId, 'deposit'),
      sumTransactions(userId, 'withdrawal', ['completed', 'approved']),
      UserOrder.countDocuments({ userId, status: 'open' }),
      FuturesPosition.countDocuments({ userId, status: 'open' }),
      UserOrder.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            status: 'closed',
            closedAt: { $gte: dayStart },
          },
        },
        { $group: { _id: null, total: { $sum: '$pnl' } } },
      ]),
      FuturesPosition.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            status: { $in: ['closed', 'liquidated'] },
            closedAt: { $gte: dayStart },
          },
        },
        { $group: { _id: null, total: { $sum: '$realizedPnl' } } },
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

    const liveBySymbol = new Map();
    const prices = {};
    for (const row of livePrices?.pairs || []) {
      if (!row?.symbol) continue;
      liveBySymbol.set(row.symbol, row);
      prices[row.symbol] = row.price;
    }

    const usdtInrRate = Number(settings?.usdtInrRate) || 83.5;
    const usdtBalance = Number(wallet?.balance) || 0;
    let assetsUsdt = 0;
    let spotTodayPnl = 0;

    for (const row of assets || []) {
      const asset = String(row.asset || '').toUpperCase();
      if (!asset || asset === 'USDT') continue;
      const qty = Number(row.balance) || 0;
      if (!(qty > 0)) continue;

      const usdtPx = Number(prices[`${asset}USDT`]);
      const inrPx = Number(prices[`${asset}INR`]);
      let px = usdtPx;
      if (!(px > 0) && inrPx > 0 && usdtInrRate > 0) px = inrPx / usdtInrRate;
      if (px > 0) assetsUsdt += qty * px;

      spotTodayPnl += spotHoldingPnlUsdt(asset, qty, liveBySymbol, usdtInrRate);
    }

    // Live futures unrealized PnL (mark vs entry)
    let futuresUnrealized = 0;
    if (futuresOpenCount > 0) {
      try {
        const futuresPositions = await listOpenPositions(userId, { markPrices: prices });
        for (const p of futuresPositions || []) {
          futuresUnrealized += Number(p.unrealizedPnl) || 0;
        }
      } catch {
        /* futures optional if mark fetch fails */
      }
    }

    const realizedToday =
      (realizedTodayRows[0]?.total || 0) + (futuresRealizedTodayRows[0]?.total || 0);
    const todayPnl = spotTodayPnl + futuresUnrealized + realizedToday;

    const stakeStats = stakeRows[0] || { count: 0, total: 0 };
    const totalBalanceUsdt = usdtBalance + assetsUsdt;
    const openPositionsCount = binaryOpenCount + futuresOpenCount;

    return success(res, {
      wallet: {
        balance_usdt: roundMoney(usdtBalance),
        locked_balance: roundMoney(wallet?.lockedBalance || 0),
        bonus_balance: roundMoney(wallet?.bonusBalance || 0),
        available_balance: roundMoney(
          Math.max(0, (wallet?.balance || 0) - (wallet?.lockedBalance || 0))
        ),
        withdrawable_balance: roundMoney(
          Math.max(
            0,
            (wallet?.balance || 0) - (wallet?.lockedBalance || 0) - (wallet?.bonusBalance || 0)
          )
        ),
        assets_usdt: roundMoney(assetsUsdt),
        total_balance_usdt: roundMoney(totalBalanceUsdt),
        assets,
      },
      stats: {
        total_deposited: roundMoney(totalDeposited),
        total_withdrawn: roundMoney(Math.abs(totalWithdrawnRaw)),
        open_positions_count: openPositionsCount,
        total_pnl: roundMoney(todayPnl),
        today_pnl: roundMoney(todayPnl),
        spot_today_pnl: roundMoney(spotTodayPnl),
        futures_unrealized_pnl: roundMoney(futuresUnrealized),
        realized_today_pnl: roundMoney(realizedToday),
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
