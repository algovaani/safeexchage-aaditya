import { Deposit } from '../../models/Deposit.js';
import { UserOrder } from '../../models/UserOrder.js';
import { success } from '../../utils/response.js';
import { roundMoney } from '../../utils/money.js';
import { buildDateRangeFilter } from '../../utils/dateFilter.js';
import { formatDeposit } from '../../services/depositService.js';

function buildDepositReportFilter(query) {
  const filter = {};
  if (query.type) filter.type = query.type;
  if (query.status) filter.status = query.status;
  Object.assign(filter, buildDateRangeFilter(query.start_date, query.end_date));
  return filter;
}

function summarizeDeposits(rows) {
  const summary = {
    total_count: rows.length,
    total_amount_usdt: 0,
    approved_amount_usdt: 0,
    pending_count: 0,
    rejected_count: 0,
  };

  for (const row of rows) {
    summary.total_amount_usdt += row.amount;
    if (row.status === 'approved') {
      summary.approved_amount_usdt += row.amount;
    } else if (row.status === 'pending') {
      summary.pending_count += 1;
    } else if (row.status === 'rejected') {
      summary.rejected_count += 1;
    }
  }

  summary.total_amount_usdt = roundMoney(summary.total_amount_usdt);
  summary.approved_amount_usdt = roundMoney(summary.approved_amount_usdt);

  return summary;
}

export async function depositReport(req, res, next) {
  try {
    const filter = buildDepositReportFilter(req.query);
    const rows = await Deposit.find(filter)
      .populate('userId', 'email mobile name')
      .sort({ createdAt: -1 })
      .lean();

    const items = rows.map((row) => formatDeposit(req, row, { includeUser: true }));
    const summary = summarizeDeposits(rows);

    return success(res, { items, summary }, 'Deposit report fetched');
  } catch (e) {
    return next(e);
  }
}

export async function tradingReport(req, res, next) {
  try {
    const dateFilter = buildDateRangeFilter(req.query.start_date, req.query.end_date);
    const matchStage = {};
    if (dateFilter.createdAt) {
      matchStage.createdAt = dateFilter.createdAt;
    }

    const pipeline = [
      ...(Object.keys(matchStage).length ? [{ $match: matchStage }] : []),
      {
        $lookup: {
          from: 'admin_trades',
          localField: 'tradeId',
          foreignField: '_id',
          as: 'trade',
        },
      },
      { $unwind: '$trade' },
      {
        $lookup: {
          from: 'trading_pairs',
          localField: 'trade.pairId',
          foreignField: '_id',
          as: 'pair',
        },
      },
      { $unwind: { path: '$pair', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$pair._id',
          symbol: { $first: '$pair.symbol' },
          display_pair: { $first: '$pair.displayPair' },
          volume_usdt: { $sum: '$marginAmount' },
          orders_count: { $sum: 1 },
          total_pnl: {
            $sum: {
              $cond: [{ $eq: ['$status', 'closed'] }, '$pnl', 0],
            },
          },
        },
      },
      { $sort: { volume_usdt: -1 } },
    ];

    const [pairRows, pnlRows] = await Promise.all([
      UserOrder.aggregate(pipeline),
      UserOrder.aggregate([
        ...(Object.keys(matchStage).length ? [{ $match: { ...matchStage, status: 'closed' } }] : [{ $match: { status: 'closed' } }]),
        { $group: { _id: null, total: { $sum: '$pnl' } } },
      ]),
    ]);

    const per_pair = pairRows.map((row) => ({
      pair_id: row._id,
      symbol: row.symbol || 'UNKNOWN',
      display_pair: row.display_pair || row.symbol || 'Unknown',
      volume_usdt: roundMoney(row.volume_usdt),
      orders_count: row.orders_count,
      total_pnl: roundMoney(row.total_pnl),
    }));

    return success(res, {
      per_pair,
      total_pnl_distributed: roundMoney(pnlRows[0]?.total || 0),
    }, 'Trading report fetched');
  } catch (e) {
    return next(e);
  }
}
