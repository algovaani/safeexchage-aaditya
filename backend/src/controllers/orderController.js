import { Order } from '../models/Order.js';
import { Trade } from '../models/Trade.js';
import { Wallet } from '../models/Wallet.js';
import { AssetBalance } from '../models/AssetBalance.js';
import { error, success } from '../utils/response.js';
import { resolveMarketPriceFast } from '../services/marketDataProvider.js';
import { processSingleOrderForPrice, notifySpotOrderFills } from '../services/orderEngine.js';
import {
  baseAssetFromSymbol,
  listUserAssets,
  lockAsset,
  unlockAsset,
  reconcileSellAssetLocks,
} from '../services/assetBalanceService.js';
import { formatWalletSnapshot, tradeableBalance } from '../services/walletAdjustmentService.js';
import { fetchWalletSnapshotForUser } from '../services/walletSnapshotService.js';
import { emitWalletPush, emitOrderUpdate } from '../services/socketService.js';
import { roundMoney, storeMoney } from '../utils/money.js';
import { unitPriceToUsdt } from '../utils/inrTrading.js';
import { SPOT_FEE_RATE, maxBuyQuantity as calcMaxBuyQty } from '../utils/spotOrderMath.js';
import { Transaction } from '../models/Transaction.js';
import {
  paginatedPayload,
  parseDatatableQuery,
  searchRegex,
} from '../utils/datatable.js';

const FEE_RATE = SPOT_FEE_RATE;

async function resolveBuyQuantity(userId, { symbol, orderType, quantity, price, marketPrice }) {
  const wallet = await Wallet.findOne({ userId });
  const available = storeMoney(tradeableBalance(wallet));

  let unitPrice = price;
  if (orderType === 'market') {
    unitPrice = marketPrice ?? (await resolveMarketPriceFast(symbol, { skipPulse: true }));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw Object.assign(new Error('Market price unavailable'), { status: 503 });
    }
  }

  const unitPriceUsdt = storeMoney(await unitPriceToUsdt(symbol, unitPrice));
  const maxQty = calcMaxBuyQty(available, unitPriceUsdt, { feeRate: FEE_RATE });
  const requested = storeMoney(quantity);
  const clipped = storeMoney(Math.min(requested, maxQty));

  return {
    quantity: clipped,
    adjusted: clipped + 1e-10 < requested,
    requested,
    maxQty,
    available,
  };
}

async function resolveSellQuantity(userId, { symbol, quantity }) {
  const baseAsset = baseAssetFromSymbol(symbol);
  void reconcileSellAssetLocks(userId, baseAsset).catch(() => {});
  const row = await AssetBalance.findOne({ userId, asset: baseAsset }).lean();
  const available = storeMoney((row?.balance || 0) - (row?.lockedBalance || 0));
  const requested = storeMoney(quantity);
  const clipped = storeMoney(Math.min(requested, available));

  return {
    quantity: clipped,
    adjusted: clipped + 1e-10 < requested,
    requested,
    available,
  };
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
    id: order._id ?? order.id,
    ...order,
    avgFillPrice: order.avgFillPrice ?? null,
  };
}

async function logPendingSpotTransaction(userId, order, estPrice) {
  if (!(Number.isFinite(estPrice) && estPrice > 0)) return;
  const sym = order.symbol;
  const unitUsdt = await unitPriceToUsdt(sym, estPrice);
  const notional = unitUsdt * order.quantity;
  const estAmount =
    order.side === 'buy' ? notional * (1 + FEE_RATE) : notional * (1 - FEE_RATE);
  await Transaction.create({
    userId,
    type: order.side === 'buy' ? 'spot_buy' : 'spot_sell',
    amount: roundMoney(estAmount),
    currency: 'USDT',
    status: 'pending',
    method: 'gateway',
    reference: `${sym} ${order.side} ${order.quantity} (${order.orderType})`,
    adminNote: `${sym} ${order.side.toUpperCase()} ${order.quantity} (${order.orderType})`,
    spotOrderId: order._id ?? order.id,
  });
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
    const io = req.app.get('io');

    if (orderType === 'limit' && (price == null || price <= 0)) {
      return error(res, 'Limit orders require price', 400);
    }

    let marketPrice = null;
    if (orderType === 'market') {
      marketPrice = await resolveMarketPriceFast(sym, { skipPulse: true });
      if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
        return error(res, 'Market price unavailable', 503);
      }
    }

    const requestedQty = storeMoney(quantity);
    let orderQty = requestedQty;
    let quantityAdjusted = false;

    if (side === 'buy') {
      const buy = await resolveBuyQuantity(req.userId, {
        symbol: sym,
        orderType,
        quantity: requestedQty,
        price,
        marketPrice,
      });
      if (!(buy.quantity > 0)) {
        return error(
          res,
          `Insufficient USDT balance (available ${roundMoney(buy.available)} USDT)`,
          400
        );
      }
      orderQty = buy.quantity;
      quantityAdjusted = buy.adjusted;
    } else {
      const sell = await resolveSellQuantity(req.userId, { symbol: sym, quantity: requestedQty });
      if (!(sell.quantity > 0)) {
        return error(res, `Insufficient ${baseAssetFromSymbol(sym)} balance`, 400);
      }
      orderQty = sell.quantity;
      quantityAdjusted = sell.adjusted;
      await lockAsset(req.userId, baseAssetFromSymbol(sym), orderQty);
    }

    const order = await Order.create({
      userId: req.userId,
      symbol: sym,
      side,
      orderType,
      quantity: orderQty,
      price: orderType === 'limit' ? price : null,
      stopLoss: stopLoss ?? null,
      takeProfit: takeProfit ?? null,
    });

    const created = order.toObject();
    emitOrderUpdate(io, req.userId, formatOrder(created));

    let trades = [];
    try {
      const fillPrice = orderType === 'market' ? marketPrice : await resolveMarketPriceFast(sym, { skipPulse: true });
      if (fillPrice > 0) {
        trades = await processSingleOrderForPrice(order._id, sym, fillPrice);
      }
    } catch (fillErr) {
      console.warn('order fill on create:', fillErr.message);
    }

    const [updated, walletSnapshot] = await Promise.all([
      Order.findById(order._id).lean(),
      fetchWalletSnapshotForUser(req.userId),
    ]);
    const finalOrder = updated || created;

    if (finalOrder.status !== 'filled' && orderType === 'limit') {
      const est =
        orderType === 'limit' && price != null
          ? Number(price)
          : await resolveMarketPriceFast(sym, { skipPulse: true }).catch(() => 0);
      void logPendingSpotTransaction(req.userId, finalOrder, est).catch(() => {});
    }

    if (trades.length) {
      void notifySpotOrderFills(io, sym, trades);
    }

    emitOrderUpdate(io, req.userId, formatOrder(finalOrder));
    emitWalletPush(
      io,
      req.userId,
      walletSnapshot,
      finalOrder.status === 'filled' ? 'spot_order_filled' : 'spot_order_placed'
    );

    const message =
      quantityAdjusted
        ? `Quantity adjusted from ${requestedQty} to ${orderQty} at current price. ${
            finalOrder.status === 'filled'
              ? `Filled at ${roundMoney(finalOrder.avgFillPrice ?? 0)}`
              : finalOrder.status === 'rejected'
                ? 'Order rejected (insufficient balance)'
                : 'Order placed'
          }`
        : finalOrder.status === 'filled'
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
        quantity_adjusted: quantityAdjusted,
        requested_quantity: requestedQty,
      },
      message,
      201
    );
  } catch (e) {
    if (req.body?.side === 'sell' && req.body?.quantity > 0) {
      const sym = String(req.body.symbol || '').toUpperCase();
      if (sym) {
        const sell = await resolveSellQuantity(req.userId, {
          symbol: sym,
          quantity: req.body.quantity,
        }).catch(() => ({ quantity: req.body.quantity }));
        await unlockAsset(req.userId, baseAssetFromSymbol(sym), sell.quantity).catch(() => {});
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

/** Exact max buy qty for current wallet (used by "click to fill" on trade UI). */
export async function getMaxBuyQuantity(req, res, next) {
  try {
    const sym = String(req.query.symbol || '').toUpperCase();
    if (!sym) return error(res, 'Symbol is required', 400);

    const orderType = String(req.query.orderType || 'market').toLowerCase() === 'limit' ? 'limit' : 'market';
    const priceParam = req.query.price != null && req.query.price !== '' ? Number(req.query.price) : null;

    const wallet = await Wallet.findOne({ userId: req.userId });
    const available = storeMoney(tradeableBalance(wallet));

    let unitPrice = priceParam;
    if (orderType === 'market') {
      unitPrice = await resolveMarketPriceFast(sym, { skipPulse: true });
    }
    if (!(Number.isFinite(unitPrice) && unitPrice > 0)) {
      return error(res, 'Price unavailable', 400);
    }

    const unitPriceUsdt = storeMoney(await unitPriceToUsdt(sym, unitPrice));
    const quantity = calcMaxBuyQty(available, unitPriceUsdt, { feeRate: FEE_RATE });

    return success(
      res,
      {
        symbol: sym,
        orderType,
        quantity,
        tradeable_balance: roundMoney(available),
        unit_price_usdt: roundMoney(unitPriceUsdt),
      },
      'Max buy quantity'
    );
  } catch (e) {
    return next(e);
  }
}

export async function cancelOrder(req, res, next) {
  try {
    const orderId = req.params.id;
    const io = req.app.get('io');

    const existing = await Order.findOne({ _id: orderId, userId: req.userId }).lean();
    if (!existing) return error(res, 'Order not found', 404);
    if (!['open', 'partially_filled'].includes(existing.status)) {
      return error(res, 'Only open orders can be cancelled', 400);
    }

    const remaining = storeMoney(existing.quantity - (existing.filledQuantity || 0));

    const updated = await Order.findOneAndUpdate(
      {
        _id: orderId,
        userId: req.userId,
        status: { $in: ['open', 'partially_filled'] },
      },
      { status: 'cancelled' },
      { new: true }
    ).lean();

    if (!updated) return error(res, 'Order cannot be cancelled', 400);

    if (updated.side === 'sell' && remaining > 0) {
      await unlockAsset(req.userId, baseAssetFromSymbol(updated.symbol), remaining);
    }

    void Transaction.findOneAndUpdate(
      { userId: req.userId, spotOrderId: orderId, status: 'pending' },
      { status: 'cancelled', adminNote: 'Order cancelled by user' }
    ).catch(() => {});

    const walletSnapshot = await fetchWalletSnapshotForUser(req.userId);
    const formatted = formatOrder(updated);

    emitOrderUpdate(io, req.userId, formatted);
    emitWalletPush(io, req.userId, walletSnapshot, 'spot_order_cancelled');

    return success(res, { ...formatted, wallet: walletSnapshot }, 'Order cancelled');
  } catch (e) {
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
