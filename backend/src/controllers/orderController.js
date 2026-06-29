import { Order } from '../models/Order.js';
import { Trade } from '../models/Trade.js';
import { Wallet } from '../models/Wallet.js';
import { error, success } from '../utils/response.js';
import { fetchTicker } from '../services/marketDataProvider.js';
import { processOrdersForPrice } from '../services/orderEngine.js';
import {
  baseAssetFromSymbol,
  getAvailableAssetBalance,
  listUserAssets,
} from '../services/assetBalanceService.js';
import { formatWalletSnapshot } from '../services/walletAdjustmentService.js';
import { roundMoney } from '../utils/money.js';
import {
  paginatedPayload,
  parseDatatableQuery,
  searchRegex,
} from '../utils/datatable.js';

const FEE_RATE = 0.001;

async function assertBuyAffordable(userId, { symbol, orderType, quantity, price }) {
  const wallet = await Wallet.findOne({ userId });
  const available = (wallet?.balance || 0) - (wallet?.lockedBalance || 0);

  let unitPrice = price;
  if (orderType === 'market') {
    const ticker = await fetchTicker(symbol);
    unitPrice = Number(ticker.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw Object.assign(new Error('Market price unavailable'), { status: 503 });
    }
  }

  const cost = unitPrice * quantity * (1 + FEE_RATE);
  if (!wallet || available < cost) {
    throw Object.assign(new Error('Insufficient USDT balance'), { status: 400 });
  }
}

async function assertSellAffordable(userId, { symbol, quantity }) {
  const baseAsset = baseAssetFromSymbol(symbol);
  const available = await getAvailableAssetBalance(userId, baseAsset);
  if (available + 1e-12 < quantity) {
    throw Object.assign(new Error(`Insufficient ${baseAsset} balance`), { status: 400 });
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
  const side = String(query.side || '').toLowerCase();
  const baseFilter = {
    $or: [{ buyerUserId: uid }, { sellerUserId: uid }],
  };

  const re = searchRegex(String(query.search || query.q || '').trim());
  if (!side && !re) return baseFilter;

  const and = [baseFilter];
  if (side === 'buy') {
    and.push({ buyerUserId: uid });
  } else if (side === 'sell') {
    and.push({ sellerUserId: uid });
  }
  if (re) {
    and.push({ $or: [{ symbol: re }] });
  }

  return { $and: and };
}

function formatOrder(order) {
  return {
    id: order._id,
    ...order,
    avgFillPrice: order.avgFillPrice ?? null,
  };
}

function formatUserTrade(trade, userId) {
  const uid = String(userId);
  const isBuyer = String(trade.buyerUserId) === uid;
  const total = trade.price * trade.quantity;
  return {
    id: trade._id,
    symbol: trade.symbol,
    side: isBuyer ? 'buy' : 'sell',
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
      await assertSellAffordable(req.userId, { symbol: sym, quantity });
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

    try {
      const ticker = await fetchTicker(sym);
      const marketPrice = Number(ticker.price);
      if (Number.isFinite(marketPrice) && marketPrice > 0) {
        await processOrdersForPrice(sym, marketPrice);
      }
    } catch (fillErr) {
      console.warn('order fill on create:', fillErr.message);
    }

    const updated = await Order.findById(order._id).lean();
    const finalOrder = updated || order.toObject();

    const [wallet, assets] = await Promise.all([
      Wallet.findOne({ userId: req.userId }).lean(),
      listUserAssets(req.userId),
    ]);

    const message =
      finalOrder.status === 'filled'
        ? `Order filled at market price (${roundMoney(finalOrder.avgFillPrice ?? 0)})`
        : finalOrder.status === 'rejected'
          ? 'Order rejected (insufficient balance)'
          : 'Order created';

    return success(
      res,
      {
        ...formatOrder(finalOrder),
        wallet: formatWalletSnapshot(wallet, assets),
      },
      message,
      201
    );
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
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
    const filter = buildTradeFilter(req.userId, req.query);

    const [dbRows, total] = await Promise.all([
      Trade.find(filter).sort(dt.sort).skip(dt.skip).limit(dt.pageSize).lean(),
      Trade.countDocuments(filter),
    ]);

    return success(
      res,
      paginatedPayload({
        rows: dbRows.map((t) => formatUserTrade(t, req.userId)),
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
