import { User } from '../../models/User.js';
import { Deposit } from '../../models/Deposit.js';
import { Withdrawal } from '../../models/Withdrawal.js';
import { AdminTrade } from '../../models/AdminTrade.js';
import { UserOrder } from '../../models/UserOrder.js';
import { Order } from '../../models/Order.js';
import { FuturesOrder } from '../../models/FuturesOrder.js';
import { Trade } from '../../models/Trade.js';
import { Transaction } from '../../models/Transaction.js';
import { UserStake } from '../../models/UserStake.js';
import { KycSubmission } from '../../models/KycSubmission.js';
import { success } from '../../utils/response.js';
import { roundMoney } from '../../utils/money.js';
import { formatDeposit } from '../../services/depositService.js';

const USER_ROLES = { $in: ['user', 'admin'] };

export async function getStats(_req, res, next) {
  try {
    const [
      totalUsers,
      activeUsers,
      blockedUsers,
      kycPending,
      kycApproved,
      depositTotalCount,
      depositApprovedAgg,
      depositPendingCount,
      activeTrades,
      tradingVolumeAgg,
      openPositions,
      stakingAgg,
    ] = await Promise.all([
      User.countDocuments({ role: USER_ROLES }),
      User.countDocuments({ role: USER_ROLES, status: 'active' }),
      User.countDocuments({ role: USER_ROLES, status: 'blocked' }),
      KycSubmission.countDocuments({ status: 'pending' }),
      KycSubmission.countDocuments({ status: 'approved' }),
      Deposit.countDocuments(),
      Deposit.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Deposit.countDocuments({ status: 'pending' }),
      AdminTrade.countDocuments({ status: 'open' }),
      UserOrder.aggregate([{ $group: { _id: null, total: { $sum: '$marginAmount' } } }]),
      UserOrder.countDocuments({ status: 'open' }),
      UserStake.aggregate([
        { $match: { status: { $in: ['active', 'matured'] } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            total: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    const staking = stakingAgg[0] || { count: 0, total: 0 };

    return success(res, {
      users: {
        total: totalUsers,
        active: activeUsers,
        blocked: blockedUsers,
        kyc_pending: kycPending,
        kyc_approved: kycApproved,
      },
      deposits: {
        total_count: depositTotalCount,
        total_amount_usdt: roundMoney(depositApprovedAgg[0]?.total || 0),
        pending_count: depositPendingCount,
      },
      trading: {
        active_trades: activeTrades,
        total_volume: roundMoney(tradingVolumeAgg[0]?.total || 0),
        open_positions: openPositions,
      },
      staking: {
        active_stakes: staking.count,
        total_staked_usdt: roundMoney(staking.total),
      },
      revenue: {
        total_fees: 0,
      },
    }, 'Admin dashboard stats fetched');
  } catch (e) {
    return next(e);
  }
}

function formatSignupEvent(user) {
  return {
    type: 'signup',
    title: 'New user signup',
    user_email: user.email || user.mobile || null,
    user_id: user._id,
    created_at: user.createdAt,
    meta: {
      name: user.name || '',
      role: user.role,
    },
  };
}

function formatDepositEvent(req, deposit) {
  const formatted = formatDeposit(req, deposit, { includeUser: true });
  return {
    type: 'deposit',
    title: `Deposit ${deposit.status}`,
    user_email: formatted.user?.email || formatted.user?.mobile || null,
    user_id: formatted.userId,
    created_at: deposit.createdAt,
    meta: {
      deposit_id: deposit._id,
      amount: roundMoney(deposit.amount),
      deposit_type: deposit.type,
      status: deposit.status,
    },
  };
}

function formatKycEvent(submission) {
  const user = submission.userId;
  return {
    type: 'kyc',
    title: `KYC submission ${submission.status}`,
    user_email: user?.email || user?.mobile || null,
    user_id: user?._id || submission.userId,
    created_at: submission.createdAt,
    meta: {
      submission_id: submission._id,
      doc_type: submission.docType,
      status: submission.status,
    },
  };
}

export async function getRecent(req, res, next) {
  try {
    const [deposits, kycRows, signups] = await Promise.all([
      Deposit.find({ status: 'pending' })
        .populate('userId', 'email mobile name')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      KycSubmission.find()
        .populate('userId', 'email mobile name')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      User.find({ role: USER_ROLES })
        .select('email mobile name role createdAt')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
    ]);

    const events = [
      ...deposits.map((d) => formatDepositEvent(req, d)),
      ...kycRows.map(formatKycEvent),
      ...signups.map(formatSignupEvent),
    ]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 20);

    return success(res, events, 'Recent activity fetched');
  } catch (e) {
    return next(e);
  }
}

function parseDateRange(period, startDate, endDate) {
  const now = new Date();
  let start = null;
  let end = null;

  if (period === 'all') {
    return { start: null, end: null };
  } else if (period === 'today') {
    start = new Date();
    start.setHours(0, 0, 0, 0);
    end = new Date();
    end.setHours(23, 59, 59, 999);
  } else if (period === 'weekly') {
    start = new Date();
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    end = new Date();
    end.setHours(23, 59, 59, 999);
  } else if (period === 'monthly') {
    start = new Date();
    start.setDate(now.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    end = new Date();
    end.setHours(23, 59, 59, 999);
  } else if (period === 'custom' && startDate) {
    start = new Date(startDate);
    if (isNaN(start.getTime())) {
      start = new Date(0);
    } else {
      start.setHours(0, 0, 0, 0);
    }

    if (endDate) {
      end = new Date(endDate);
      if (isNaN(end.getTime())) {
        end = new Date();
      } else {
        end.setHours(23, 59, 59, 999);
      }
    } else {
      end = new Date();
      end.setHours(23, 59, 59, 999);
    }
  } else {
    // Default to 'all' if period is 'all' or empty
    return { start: null, end: null };
  }

  return { start, end };
}

export async function getAdvanceDashboardStats(req, res, next) {
  try {
    const { period = 'all', startDate, endDate } = req.query;
    const { start, end } = parseDateRange(period, startDate, endDate);

    const dateQuery = start && end ? { createdAt: { $gte: start, $lte: end } } : {};

    const [
      deposits,
      withdrawals,
      userOrders,
      futuresOrders,
      spotTrades,
      spotOrders,
    ] = await Promise.all([
      Deposit.find(dateQuery)
        .populate('userId', 'email mobile name')
        .sort({ createdAt: -1 })
        .lean(),
      Withdrawal.find(dateQuery)
        .populate('userId', 'email mobile name')
        .sort({ createdAt: -1 })
        .lean(),
      UserOrder.find(dateQuery)
        .populate('userId', 'email mobile name')
        .populate({
          path: 'tradeId',
          populate: { path: 'pairId', select: 'symbol name' },
        })
        .sort({ createdAt: -1 })
        .lean(),
      FuturesOrder.find(dateQuery)
        .populate('userId', 'email mobile name')
        .sort({ createdAt: -1 })
        .lean(),
      Trade.find(dateQuery)
        .populate('buyerUserId', 'email mobile name')
        .populate('sellerUserId', 'email mobile name')
        .sort({ createdAt: -1 })
        .lean(),
      Order.find(dateQuery)
        .populate('userId', 'email mobile name')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    // 1. Fund Movements Analytics (Deposits & Withdrawals)
    let totalDepositsApproved = 0;
    let totalDepositsPending = 0;
    let approvedDepositCount = 0;
    let pendingDepositCount = 0;
    let rejectedDepositCount = 0;

    const formattedFundMovements = [];

    deposits.forEach((d) => {
      const amt = Number(d.usdtAmount || d.amount || 0);
      if (d.status === 'approved') {
        totalDepositsApproved += amt;
        approvedDepositCount++;
      } else if (d.status === 'pending') {
        totalDepositsPending += amt;
        pendingDepositCount++;
      } else if (d.status === 'rejected') {
        rejectedDepositCount++;
      }

      formattedFundMovements.push({
        id: d._id,
        type: 'deposit',
        user: d.userId ? { id: d.userId._id, email: d.userId.email, mobile: d.userId.mobile, name: d.userId.name } : null,
        amount: roundMoney(amt),
        currency: d.currency || 'USDT',
        method: d.type || 'crypto',
        status: d.status,
        txnHash: d.txnHash || d.utrNumber || '—',
        createdAt: d.createdAt,
      });
    });

    let totalWithdrawalsApproved = 0;
    let totalWithdrawalsPending = 0;
    let approvedWithdrawalCount = 0;
    let pendingWithdrawalCount = 0;
    let rejectedWithdrawalCount = 0;

    withdrawals.forEach((w) => {
      const amt = Number(w.amount || 0);
      if (w.status === 'approved') {
        totalWithdrawalsApproved += amt;
        approvedWithdrawalCount++;
      } else if (w.status === 'pending') {
        totalWithdrawalsPending += amt;
        pendingWithdrawalCount++;
      } else if (w.status === 'rejected' || w.status === 'cancelled') {
        rejectedWithdrawalCount++;
      }

      formattedFundMovements.push({
        id: w._id,
        type: 'withdrawal',
        user: w.userId ? { id: w.userId._id, email: w.userId.email, mobile: w.userId.mobile, name: w.userId.name } : null,
        amount: roundMoney(amt),
        currency: w.currency || 'USDT',
        method: w.type || 'crypto',
        status: w.status,
        txnHash: w.walletAddress || w.accountNumber || '—',
        createdAt: w.createdAt,
      });
    });

    formattedFundMovements.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 2. Trades & PnL Analytics
    let totalTradesCount = 0;
    let totalTradeVolume = 0;
    let totalUserProfit = 0;
    let totalUserLoss = 0;
    let totalTradingFees = 0;

    const symbolStatsMap = {};
    const formattedTradesList = [];
    const userPnLMap = {};

    function getOrCreateSymbol(sym) {
      const s = (sym || 'UNKNOWN').toUpperCase();
      if (!symbolStatsMap[s]) {
        symbolStatsMap[s] = { symbol: s, count: 0, volume: 0, userProfit: 0, userLoss: 0 };
      }
      return symbolStatsMap[s];
    }

    function updateUserPnL(user, volume, pnl) {
      if (!user?._id) return;
      const uid = String(user._id);
      if (!userPnLMap[uid]) {
        userPnLMap[uid] = {
          user: { id: user._id, email: user.email, mobile: user.mobile, name: user.name },
          tradeCount: 0,
          volume: 0,
          pnl: 0,
          depositTotal: 0,
        };
      }
      userPnLMap[uid].tradeCount++;
      userPnLMap[uid].volume += volume;
      userPnLMap[uid].pnl += pnl;
    }

    // Process Signal / Admin Trades (UserOrder)
    userOrders.forEach((o) => {
      totalTradesCount++;
      const margin = Number(o.marginAmount || 0);
      const lev = Number(o.tradeId?.leverage || 1);
      const vol = margin * lev;
      totalTradeVolume += vol;

      const pnl = Number(o.pnl || 0);
      if (pnl > 0) totalUserProfit += pnl;
      if (pnl < 0) totalUserLoss += Math.abs(pnl);

      const symName = o.tradeId?.pairId?.symbol || 'SIGNAL-TRADE';
      const symObj = getOrCreateSymbol(symName);
      symObj.count++;
      symObj.volume += vol;
      if (pnl > 0) symObj.userProfit += pnl;
      if (pnl < 0) symObj.userLoss += Math.abs(pnl);

      updateUserPnL(o.userId, vol, pnl);

      formattedTradesList.push({
        id: o._id,
        category: 'Signal Trade',
        user: o.userId ? { id: o.userId._id, email: o.userId.email, mobile: o.userId.mobile, name: o.userId.name } : null,
        symbol: symName,
        side: 'BUY',
        margin: roundMoney(margin),
        volume: roundMoney(vol),
        entryPrice: o.entryPrice || 0,
        closePrice: o.closePrice || 0,
        leverage: lev,
        pnl: roundMoney(pnl),
        status: o.status,
        createdAt: o.createdAt,
      });
    });

    // Process Futures Orders
    futuresOrders.forEach((fo) => {
      totalTradesCount++;
      const price = Number(fo.price || 0);
      const qty = Number(fo.quantity || 0);
      const lev = Number(fo.leverage || 1);
      const vol = price * qty;
      totalTradeVolume += vol;

      const fee = Number(fo.fee || 0);
      totalTradingFees += fee;

      const pnl = Number(fo.pnl || 0);
      if (pnl > 0) totalUserProfit += pnl;
      if (pnl < 0) totalUserLoss += Math.abs(pnl);

      const symName = fo.symbol || 'FUTURES';
      const symObj = getOrCreateSymbol(symName);
      symObj.count++;
      symObj.volume += vol;
      if (pnl > 0) symObj.userProfit += pnl;
      if (pnl < 0) symObj.userLoss += Math.abs(pnl);

      updateUserPnL(fo.userId, vol, pnl);

      formattedTradesList.push({
        id: fo._id,
        category: 'Futures',
        user: fo.userId ? { id: fo.userId._id, email: fo.userId.email, mobile: fo.userId.mobile, name: fo.userId.name } : null,
        symbol: symName,
        side: (fo.side || 'LONG').toUpperCase(),
        margin: roundMoney(vol / Math.max(lev, 1)),
        volume: roundMoney(vol),
        entryPrice: price,
        closePrice: price,
        leverage: lev,
        pnl: roundMoney(pnl),
        status: fo.status,
        createdAt: fo.createdAt,
      });
    });

    // Process Spot Trades
    spotTrades.forEach((st) => {
      totalTradesCount++;
      const price = Number(st.price || 0);
      const qty = Number(st.quantity || 0);
      const vol = price * qty;
      totalTradeVolume += vol;

      const fee = Number(st.fee || 0);
      totalTradingFees += fee;

      const symName = st.symbol || 'SPOT';
      const symObj = getOrCreateSymbol(symName);
      symObj.count++;
      symObj.volume += vol;

      if (st.buyerUserId) updateUserPnL(st.buyerUserId, vol, 0);
      if (st.sellerUserId) updateUserPnL(st.sellerUserId, vol, 0);

      formattedTradesList.push({
        id: st._id,
        category: 'Spot',
        user: st.buyerUserId ? { id: st.buyerUserId._id, email: st.buyerUserId.email, mobile: st.buyerUserId.mobile, name: st.buyerUserId.name } : null,
        symbol: symName,
        side: 'BUY',
        margin: roundMoney(vol),
        volume: roundMoney(vol),
        entryPrice: price,
        closePrice: price,
        leverage: 1,
        pnl: 0,
        status: 'filled',
        createdAt: st.createdAt,
      });
    });

    // Process Spot Orders
    spotOrders.forEach((so) => {
      totalTradesCount++;
      const price = Number(so.price || so.avgFillPrice || 0);
      const qty = Number(so.quantity || so.filledQuantity || 0);
      const vol = price * qty;
      totalTradeVolume += vol;

      const symName = so.symbol || 'SPOT';
      const symObj = getOrCreateSymbol(symName);
      symObj.count++;
      symObj.volume += vol;

      if (so.userId) updateUserPnL(so.userId, vol, 0);

      formattedTradesList.push({
        id: so._id,
        category: 'Spot Order',
        user: so.userId ? { id: so.userId._id, email: so.userId.email, mobile: so.userId.mobile, name: so.userId.name } : null,
        symbol: symName,
        side: (so.side || 'BUY').toUpperCase(),
        margin: roundMoney(vol),
        volume: roundMoney(vol),
        entryPrice: price,
        closePrice: price,
        leverage: 1,
        pnl: 0,
        status: so.status,
        createdAt: so.createdAt,
      });
    });

    formattedTradesList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Calculate user deposit totals for user leaderboards
    deposits.forEach((d) => {
      if (d.userId && d.status === 'approved') {
        const uid = String(d.userId._id);
        if (!userPnLMap[uid]) {
          userPnLMap[uid] = {
            user: { id: d.userId._id, email: d.userId.email, mobile: d.userId.mobile, name: d.userId.name },
            tradeCount: 0,
            volume: 0,
            pnl: 0,
            depositTotal: 0,
          };
        }
        userPnLMap[uid].depositTotal += Number(d.usdtAmount || d.amount || 0);
      }
    });

    const userList = Object.values(userPnLMap);
    const topTradersByVolume = [...userList].sort((a, b) => b.volume - a.volume).slice(0, 5);
    const topTradersByPnL = [...userList].sort((a, b) => b.pnl - a.pnl).slice(0, 5);
    const topFunders = [...userList].sort((a, b) => b.depositTotal - a.depositTotal).slice(0, 5);

    // Platform Net PnL (Platform perspective: User Loss is Platform Gain, User Profit is Platform Payout)
    const netSystemPnL = (totalUserLoss - totalUserProfit) + totalTradingFees;

    return success(
      res,
      {
        period,
        dateRange: {
          start: start ? start.toISOString() : null,
          end: end ? end.toISOString() : null,
        },
        overview: {
          netSystemPnL: roundMoney(netSystemPnL),
          totalUserProfit: roundMoney(totalUserProfit),
          totalUserLoss: roundMoney(totalUserLoss),
          totalTradingFees: roundMoney(totalTradingFees),
          totalTradesCount,
          totalTradeVolume: roundMoney(totalTradeVolume),
          totalDepositsApproved: roundMoney(totalDepositsApproved),
          totalDepositsPending: roundMoney(totalDepositsPending),
          totalWithdrawalsApproved: roundMoney(totalWithdrawalsApproved),
          totalWithdrawalsPending: roundMoney(totalWithdrawalsPending),
          netFundInflow: roundMoney(totalDepositsApproved - totalWithdrawalsApproved),
        },
        counts: {
          approvedDepositCount,
          pendingDepositCount,
          rejectedDepositCount,
          approvedWithdrawalCount,
          pendingWithdrawalCount,
          rejectedWithdrawalCount,
        },
        tradesBySymbol: Object.values(symbolStatsMap).map((s) => ({
          ...s,
          volume: roundMoney(s.volume),
          userProfit: roundMoney(s.userProfit),
          userLoss: roundMoney(s.userLoss),
        })),
        tradesList: formattedTradesList.slice(0, 100),
        fundMovements: formattedFundMovements.slice(0, 100),
        leaderboards: {
          topTradersByVolume: topTradersByVolume.map((u) => ({ ...u, volume: roundMoney(u.volume), pnl: roundMoney(u.pnl) })),
          topTradersByPnL: topTradersByPnL.map((u) => ({ ...u, volume: roundMoney(u.volume), pnl: roundMoney(u.pnl) })),
          topFunders: topFunders.map((u) => ({ ...u, depositTotal: roundMoney(u.depositTotal) })),
        },
      },
      'Advance dashboard stats fetched successfully'
    );
  } catch (e) {
    return next(e);
  }
}

