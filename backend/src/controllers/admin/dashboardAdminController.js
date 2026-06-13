import { User } from '../../models/User.js';
import { Deposit } from '../../models/Deposit.js';
import { AdminTrade } from '../../models/AdminTrade.js';
import { UserOrder } from '../../models/UserOrder.js';
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
