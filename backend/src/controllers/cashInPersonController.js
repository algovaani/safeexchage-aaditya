import { CashInPersonRequest } from '../models/CashInPersonRequest.js';
import { formatCashInPersonRequest } from '../services/cashInPersonService.js';
import { error, success } from '../utils/response.js';

export async function submitRequest(req, res, next) {
  try {
    const { mobile, city, amount, type } = req.body;
    const requestType = type === 'withdraw' ? 'withdraw' : 'deposit';
    const existing = await CashInPersonRequest.findOne({
      userId: req.userId,
      status: 'pending',
      type: requestType,
    }).lean();

    if (existing) {
      return error(res, `You already have a pending cash-in-person ${requestType} request`, 400);
    }

    const requestedAmount =
      amount != null && amount !== '' && Number.isFinite(Number(amount)) && Number(amount) > 0
        ? Number(amount)
        : null;

    if (requestType === 'withdraw' && !(requestedAmount > 0)) {
      return error(res, 'Amount is required for withdraw requests', 400);
    }

    const row = await CashInPersonRequest.create({
      userId: req.userId,
      type: requestType,
      mobile: String(mobile).trim(),
      city: String(city).trim(),
      requestedAmount,
    });

    return success(
      res,
      formatCashInPersonRequest(row.toObject()),
      'Request submitted — our team will contact you shortly'
    );
  } catch (e) {
    return next(e);
  }
}

export async function myRequests(req, res, next) {
  try {
    const rows = await CashInPersonRequest.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return success(
      res,
      rows.map((r) => formatCashInPersonRequest(r)),
      'Cash in person requests fetched'
    );
  } catch (e) {
    return next(e);
  }
}
