import {
  getFuturesSettings,
  publicFuturesConfig,
} from '../services/futuresSettingsService.js';
import {
  listOpenPositions,
  listPositionHistory,
  listOrderHistory,
  estimateOrder,
  openPosition,
  closePosition,
  editPositionTpSl,
  adjustPositionMargin,
  reversePosition,
} from '../services/futuresService.js';
import { fetchWalletSnapshotForUser } from '../services/walletSnapshotService.js';
import { success, error } from '../utils/response.js';

function uid(req) {
  return req.userId || String(req.user?._id || '');
}

export async function getConfig(_req, res) {
  try {
    const settings = await getFuturesSettings();
    return success(res, publicFuturesConfig(settings));
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function getPositions(req, res) {
  try {
    const positions = await listOpenPositions(uid(req));
    return success(res, { positions });
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function getPositionHistory(req, res) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const data = await listPositionHistory(uid(req), { page, limit });
    return success(res, data);
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function getOrderHistory(req, res) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 30;
    const data = await listOrderHistory(uid(req), { page, limit });
    return success(res, data);
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function postEstimate(req, res) {
  try {
    const data = await estimateOrder(uid(req), req.body);
    return success(res, data);
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function postOpen(req, res) {
  try {
    const io = req.app.get('io');
    const userId = uid(req);
    const position = await openPosition(userId, req.body, { io });
    const wallet = await fetchWalletSnapshotForUser(userId);
    return success(res, { position, wallet }, 'Position opened');
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function postClose(req, res) {
  try {
    const io = req.app.get('io');
    const position = await closePosition(uid(req), req.params.id, {
      quantity: req.body.quantity,
      io,
    });
    return success(res, { position }, 'Position closed');
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function patchTpSl(req, res) {
  try {
    const io = req.app.get('io');
    const position = await editPositionTpSl(uid(req), req.params.id, req.body, { io });
    return success(res, { position }, 'TP/SL updated');
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function patchMargin(req, res) {
  try {
    const io = req.app.get('io');
    const position = await adjustPositionMargin(uid(req), req.params.id, req.body, { io });
    return success(res, { position }, 'Margin updated');
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}

export async function postReverse(req, res) {
  try {
    const io = req.app.get('io');
    const position = await reversePosition(uid(req), req.params.id, { io });
    return success(res, { position }, 'Position reversed');
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
}
