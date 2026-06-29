import { Transaction } from '../models/Transaction.js';
import { success } from '../utils/response.js';
import { roundMoney } from '../utils/money.js';
import {
  backfillOrphanFinancialRecords,
  ensureOpeningBalanceTransaction,
} from '../services/transactionService.js';
import {
  buildDateRangeFilter,
  paginatedPayload,
  parseDatatableQuery,
  searchRegex,
  sendCsvExport,
} from '../utils/datatable.js';
import {
  isDebitType,
  transactionTypeLabel,
  transactionTypesForFilter,
} from '../utils/transactionTypes.js';

function formatTransaction(tx) {
  const amount = roundMoney(tx.amount);
  return {
    id: tx._id,
    type: tx.type,
    type_label: transactionTypeLabel(tx.type),
    amount,
    signed_amount: isDebitType(tx.type) ? -Math.abs(amount) : Math.abs(amount),
    balance_after: tx.balanceAfter != null ? roundMoney(tx.balanceAfter) : null,
    currency: tx.currency || 'USDT',
    status: tx.status,
    method: tx.method || null,
    date: tx.createdAt,
    reference: tx.reference || null,
    remark: tx.adminNote || '',
    admin_note: tx.adminNote || '',
  };
}

export async function listTransactions(req, res, next) {
  try {
    const dt = parseDatatableQuery(req.query);
    const userId = req.userId;

    await backfillOrphanFinancialRecords(userId);
    await ensureOpeningBalanceTransaction(userId);

    const filter = { userId, ...buildDateRangeFilter(req.query) };
    const types = transactionTypesForFilter(req.query.type);
    const status = req.query.status || 'all';

    if (types) filter.type = { $in: types };
    if (status !== 'all') {
      filter.status = status === 'completed' ? { $in: ['completed', 'approved'] } : status;
    }

    const re = searchRegex(dt.search);
    if (re) {
      filter.$or = [{ type: re }, { status: re }, { reference: re }, { currency: re }, { adminNote: re }];
    }

    if (dt.isExport) {
      const dbRows = await Transaction.find(filter).sort(dt.sort).lean();
      const rows = dbRows.map(formatTransaction);
      const exportColumns = [
        { key: 'type_label', label: 'Type', export: (r) => r.type_label },
        { key: 'currency', label: 'Asset' },
        { key: 'amount', label: 'Amount' },
        { key: 'balance_after', label: 'Balance After', export: (r) => r.balance_after ?? '' },
        { key: 'status', label: 'Status' },
        { key: 'remark', label: 'Remark', export: (r) => r.remark || '' },
        { key: 'date', label: 'Date', export: (r) => (r.date ? new Date(r.date).toISOString() : '') },
        { key: 'reference', label: 'Reference', export: (r) => r.reference || '' },
      ];
      return sendCsvExport(res, 'transactions.csv', rows, exportColumns);
    }

    const [dbRows, total] = await Promise.all([
      Transaction.find(filter).sort(dt.sort).skip(dt.skip).limit(dt.pageSize).lean(),
      Transaction.countDocuments(filter),
    ]);

    const rows = dbRows.map(formatTransaction);

    return success(
      res,
      paginatedPayload({ rows, total, page: dt.page, pageSize: dt.pageSize }),
      'Transactions fetched'
    );
  } catch (e) {
    return next(e);
  }
}
