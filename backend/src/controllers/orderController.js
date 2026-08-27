import { Order } from '../models/Order.js';
import { Trade } from '../models/Trade.js';
import { Wallet } from '../models/Wallet.js';
import { AssetBalance } from '../models/AssetBalance.js';
import { error, success } from '../utils/response.js';
import { fetchTicker, fetchLivePriceForMatching } from '../services/marketDataProvider.js';
import { processOrdersForPrice, notifySpotOrderFills } from '../services/orderEngine.js';
import {
  baseAssetFromSymbol,
  listUserAssets,
  lockAsset,
  unlockAsset,
  reconcileSellAssetLocks,
} from '../services/assetBalanceService.js';
import { formatWalletSnapshot, tradeableBalance } from '../services/walletAdjustmentService.js';
import { fetchWalletSnapshotForUser } from '../services/walletSnapshotService.js';
import { emitWalletUpdate } from '../services/socketService.js';
import { roundMoney } from '../utils/money.js';
import { unitPriceToUsdt } from '../utils/inrTrading.js';
import { Transaction } from '../models/Transaction.js';
import {
  paginatedPayload,
  parseDatatableQuery,
  searchRegex,
} from '../utils/datatable.js';

const FEE_RATE = 0.001;

async function assertBuyAffordable(userId, { symbol, orderType, quantity, price }) {
  const wallet = await Wallet.findOne({ userId });
  const available = tradeableBalance(wallet);

  let unitPrice = price;
  if (orderType === 'market') {
    const ticker = await fetchTicker(symbol, { skipPulse: true });
    unitPrice = Number(ticker.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw Object.assign(new Error('Market price unavailable'), { status: 503 });
    }
  }

  unitPrice = await unitPriceToUsdt(symbol, unitPrice);

  const cost = unitPrice * quantity * (1 + FEE_RATE);
  if (!wallet || available < cost) {
    const msg = wallet
      ? `Insufficient USDT balance (need ${roundMoney(cost)} USDT, available ${roundMoney(available)} USDT)`
      : 'Insufficient USDT balance';
    throw Object.assign(new Error(msg), { status: 400 });
  }
}

async function assertSellAffordable(userId, { symbol, quantity }) {
  const baseAsset = baseAssetFromSymbol(symbol);
  const row = await AssetBalance.findOne({ userId, asset: baseAsset }).lean();
  const balance = row?.balance || 0;
  const locked = row?.lockedBalance || 0;
  const available = balance - locked;
  if (available + 1e-12 < quantity) {
    const msg =
      locked > 0
        ? `Insufficient ${baseAsset} balance (available ${roundMoney(available)} ${baseAsset}, ${roundMoney(locked)} locked in open sell orders)`
        : `Insufficient ${baseAsset} balance (available ${roundMoney(available)} ${baseAsset})`;
    throw Object.assign(new Error(msg), { status: 400 });
  }
}

function buildOrderFilter(userId, query) {
  const filter = { userId };
  const side = String(query.side || '').toLowerCase();
  const status = String(query.status || '').toLowerCase();

  if (side === 'buy' || side === 'sell') filter.side = side;
  if (status === 'pending') {
    filter.status = { $in: ['open', 'partially_filled'] };
  } else if (status === 'completed') {
    filter.status = { $in: ['filled', 'cancelled', 'rejected'] };
  }

  const re = searchRegex(String(query.search || query.q || '').trim());
  if (re) {
    filter.$or = [
      { symbol: re },
      { side: re },
      { status: re },
      { orderType: re },
    ];
  }

  return filter;
}

function buildTradeFilter(userId, query) {
  const uid = userId;
  const re = searchRegex(String(query.search || query.q || '').trim());

  const and = [{ $or: [{ buyerUserId: uid }, { sellerUserId: uid }] }];
  if (re) {
    and.push({ $or: [{ symbol: re }] });
  }

  return and.length === 1 ? and[0] : { $and: and };
}

async function buildTradeSideFilter(userId, query) {
  const uid = userId;
  const side = String(query.side || '').toLowerCase();
  const base = buildTradeFilter(userId, query);

  if (side !== 'buy' && side !== 'sell') return base;

  const orderIds = await Order.find({ userId: uid, side }).distinct('_id');
  if (!orderIds.length) return { _id: { $in: [] } };

  const sideMatch =
    side === 'buy'
      ? { buyOrderId: { $in: orderIds } }
      : { sellOrderId: { $in: orderIds } };

  return { $and: [base, sideMatch] };
}

function formatOrder(order) {
  return {
    id: order._id,
    ...order,
    avgFillPrice: order.avgFillPrice ?? null,
  };
}

function formatUserTrade(trade, userId, orderById = new Map()) {
  const uid = String(userId);
  const order =
    orderById.get(String(trade.buyOrderId)) ||
    orderById.get(String(trade.sellOrderId)) ||
    null;

  let side;
  if (order && String(order.userId) === uid) {
    side = order.side;
  } else if (String(trade.buyerUserId) === uid && String(trade.sellerUserId) !== uid) {
    side = 'buy';
  } else if (String(trade.sellerUserId) === uid && String(trade.buyerUserId) !== uid) {
    side = 'sell';
  } else {
    side = String(trade.buyerUserId) === uid ? 'buy' : 'sell';
  }

  const total = trade.price * trade.quantity;
  return {
    id: trade._id,
    symbol: trade.symbol,
    side,
    price: trade.price,
    quantity: trade.quantity,
    fee: trade.fee,
    total: roundMoney(total),
    createdAt: trade.createdAt,
  };
}

export async function createOrder(req, res, next) {
  try {
    const { symbol, side, orderType, quantity, price, stopLoss, takeProfit } = req.body;
    const sym = symbol.toUpperCase();

    if (orderType === 'limit' && (price == null || price <= 0)) {
      return error(res, 'Limit orders require price', 400);
    }

    if (side === 'buy') {
      await assertBuyAffordable(req.userId, { symbol: sym, orderType, quantity, price });
    } else {
      const baseAsset = baseAssetFromSymbol(sym);
      await reconcileSellAssetLocks(req.userId, baseAsset);
      await assertSellAffordable(req.userId, { symbol: sym, quantity });
      await lockAsset(req.userId, baseAsset, quantity);
    }

    const order = await Order.create({
      userId: req.userId,
      symbol: sym,
      side,
      orderType,
      quantity,
      price: orderType === 'limit' ? price : null,
      stopLoss: stopLoss ?? null,
      takeProfit: takeProfit ?? null,
    });

    let estPrice = price;
    if (orderType === 'market' || estPrice == null) {
      try {
        const ticker = await fetchTicker(sym);
        estPrice = Number(ticker.price);
      } catch {
        estPrice = 0;
      }
    }
    if (Number.isFinite(estPrice) && estPrice > 0) {
      const unitUsdt = await unitPriceToUsdt(sym, estPrice);
      const notional = unitUsdt * quantity;
      const estAmount = side === 'buy' ? notional * (1 + FEE_RATE) : notional * (1 - FEE_RATE);
      await Transaction.create({
        userId: req.userId,
        type: side === 'buy' ? 'spot_buy' : 'spot_sell',
        amount: roundMoney(estAmount),
        currency: 'USDT',
        status: 'pending',
        method: 'gateway',
        reference: `${sym} ${side} ${quantity} (${orderType})`,
        adminNote: `${sym} ${side.toUpperCase()} ${quantity} (${orderType})`,
        spotOrderId: order._id,
      });
    }

    let trades = [];
    try {
      const marketPrice = await fetchLivePriceForMatching(sym);
      trades = await processOrdersForPrice(sym, marketPrice);
    } catch (fillErr) {
      console.warn('order fill on create:', fillErr.message);
    }

    const updated = await Order.findById(order._id).lean();
    const finalOrder = updated || order.toObject();

    const [walletSnapshot] = await Promise.all([
      fetchWalletSnapshotForUser(req.userId),
      trades.length
        ? notifySpotOrderFills(req.app.get('io'), sym, trades)
        : Promise.resolve(),
    ]);

    void emitWalletUpdate(req.app.get('io'), req.userId, {
      reason: finalOrder.status === 'filled' ? 'spot_order_filled' : 'spot_order_placed',
    }).catch(() => {});

    const message =
      finalOrder.status === 'filled'
        ? finalOrder.orderType === 'limit' && finalOrder.price != null
          ? `Limit order filled at ${roundMoney(finalOrder.avgFillPrice ?? 0)} (limit ${roundMoney(finalOrder.price)})`
          : `Order filled at market price (${roundMoney(finalOrder.avgFillPrice ?? 0)})`
        : finalOrder.status === 'rejected'
          ? 'Order rejected (insufficient balance)'
          : 'Order created';

    return success(
      res,
      {
        ...formatOrder(finalOrder),
        wallet: walletSnapshot,
      },
      message,
      201
    );
  } catch (e) {
    if (req.body?.side === 'sell' && req.body?.quantity > 0) {
      const sym = String(req.body.symbol || '').toUpperCase();
      if (sym) {
        await unlockAsset(req.userId, baseAssetFromSymbol(sym), req.body.quantity).catch(() => {});
      }
    }
    if (e.status) {
      console.warn(
        `[orders] rejected user=${req.userId} ${req.body?.side || ''} ${req.body?.symbol || ''}: ${e.message}`
      );
      return error(res, e.message, e.status);
    }
    return next(e);
  }
}

export async function listOrders(req, res, next) {
  try {
    const dt = parseDatatableQuery(req.query);
    const filter = buildOrderFilter(req.userId, req.query);

    const [dbRows, total] = await Promise.all([
      Order.find(filter).sort(dt.sort).skip(dt.skip).limit(dt.pageSize).lean(),
      Order.countDocuments(filter),
    ]);

    return success(
      res,
      paginatedPayload({
        rows: dbRows.map(formatOrder),
        total,
        page: dt.page,
        pageSize: dt.pageSize,
      }),
      'Orders fetched'
    );
  } catch (e) {
    return next(e);
  }
}

export async function listOpenOrders(req, res, next) {
  try {
    const orders = await Order.find({
      userId: req.userId,
      status: { $in: ['open', 'partially_filled'] },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return success(res, orders.map(formatOrder), 'Open orders fetched');
  } catch (e) {
    return next(e);
  }
}

export async function listTrades(req, res, next) {
  try {
    const dt = parseDatatableQuery(req.query);
    const filter = await buildTradeSideFilter(req.userId, req.query);

    const [dbRows, total] = await Promise.all([
      Trade.find(filter).sort(dt.sort).skip(dt.skip).limit(dt.pageSize).lean(),
      Trade.countDocuments(filter),
    ]);

    const orderIds = [
      ...new Set(
        dbRows.flatMap((t) => [String(t.buyOrderId), String(t.sellOrderId)].filter(Boolean))
      ),
    ];
    const orders = orderIds.length
      ? await Order.find({ _id: { $in: orderIds } }).select('_id side userId').lean()
      : [];
    const orderById = new Map(orders.map((o) => [String(o._id), o]));

    return success(
      res,
      paginatedPayload({
        rows: dbRows.map((t) => formatUserTrade(t, req.userId, orderById)),
        total,
        page: dt.page,
        pageSize: dt.pageSize,
      }),
      'Trades fetched'
    );
  } catch (e) {
    return next(e);
  }
}
