import {
  getFuturesSettings,
  updateFuturesSettings,
  publicFuturesConfig,
} from '../../services/futuresSettingsService.js';
import { adminListPositions, adminForceClose } from '../../services/futuresService.js';
import { FuturesOrder } from '../../models/FuturesOrder.js';
import { success, error } from '../../utils/response.js';

export async function getSettings(_req, res) {
  try {
    const settings = await getFuturesSettings({ force: true });
    return success(res, settings);
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function putSettings(req, res) {
  try {
    const settings = await updateFuturesSettings(req.body, req.userId || req.user?._id);
    return success(res, settings, 'Futures settings updated');
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function getPublicConfig(_req, res) {
  try {
    const settings = await getFuturesSettings();
    return success(res, publicFuturesConfig(settings));
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function listPositions(req, res) {
  try {
    const status = req.query.status || 'open';
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const data = await adminListPositions({ status, page, limit });
    return success(res, data);
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function forceClose(req, res) {
  try {
    const io = req.app.get('io');
    const position = await adminForceClose(req.params.id, { io });
    return success(res, { position }, 'Position force-closed');
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function listOrders(req, res) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      FuturesOrder.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'email name')
        .lean(),
      FuturesOrder.countDocuments({}),
    ]);
    return success(res, {
      items: rows.map((o) => ({
        id: String(o._id),
        user: o.userId ? { id: String(o.userId._id), email: o.userId.email, name: o.userId.name } : null,
        symbol: o.symbol,
        side: o.side,
        action: o.action,
        quantity: o.quantity,
        price: o.price,
        fee: o.fee,
        pnl: o.pnl,
        status: o.status,
        createdAt: o.createdAt,
      })),
      total,
      page,
      limit,
    });
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function overview(_req, res) {
  try {
    const { FuturesPosition } = await import('../../models/FuturesPosition.js');
    const [openCount, liquidatedToday, settings] = await Promise.all([
      FuturesPosition.countDocuments({ status: 'open' }),
      FuturesPosition.countDocuments({
        status: 'liquidated',
        closedAt: { $gte: new Date(Date.now() - 86400000) },
      }),
      getFuturesSettings(),
    ]);
    return success(res, {
      enabled: settings.enabled,
      openPositions: openCount,
      liquidations24h: liquidatedToday,
      maxLeverage: settings.maxLeverage,
    });
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}
