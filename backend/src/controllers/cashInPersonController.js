import { CashInPersonRequest } from '../models/CashInPersonRequest.js';
import { formatCashInPersonRequest } from '../services/cashInPersonService.js';
import { error, success } from '../utils/response.js';

export async function submitRequest(req, res, next) {
  try {
    const { mobile, city, amount } = req.body;
    const existing = await CashInPersonRequest.findOne({
      userId: req.userId,
      status: 'pending',
    }).lean();

    if (existing) {
      return error(res, 'You already have a pending cash-in-person request', 400);
    }

    const requestedAmount =
      amount != null && amount !== '' && Number.isFinite(Number(amount)) && Number(amount) > 0
        ? Number(amount)
        : null;

    const row = await CashInPersonRequest.create({
      userId: req.userId,
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
