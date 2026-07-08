import mongoose from 'mongoose';
import { FuturesPosition } from '../models/FuturesPosition.js';
import { FuturesOrder } from '../models/FuturesOrder.js';
import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';
import { fetchTicker } from './marketDataProvider.js';
import { getFuturesSettings } from './futuresSettingsService.js';
import { emitWalletUpdate, emitFuturesUpdate } from './socketService.js';
import { roundMoney, storeMoney } from '../utils/money.js';
import {
  initialMargin,
  tradingFee,
  unrealizedPnl,
  liquidationPrice,
  roePercent,
  notional,
  validateTpSl,
  shouldTriggerTpSl,
  isLiquidated,
} from '../utils/futuresMath.js';

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

async function resolveMarkPrice(symbol) {
  const ticker = await fetchTicker(symbol, { force: true });
  const mark = Number(ticker?.lastPrice ?? ticker?.price);
  if (!Number.isFinite(mark) || mark <= 0) throw httpError('Market price unavailable', 503);
  return mark;
}

function positionView(pos, markPrice, settings) {
  const mark = markPrice ?? pos.markPrice ?? pos.entryPrice;
  const upnl = unrealizedPnl({
    side: pos.side,
    quantity: pos.quantity,
    entryPrice: pos.entryPrice,
    markPrice: mark,
  });
  const liq = liquidationPrice({
    side: pos.side,
    entryPrice: pos.entryPrice,
    quantity: pos.quantity,
    margin: pos.margin,
    maintenanceRate: settings?.maintenanceMarginRate,
  });
  const closeFee = tradingFee(pos.quantity, mark, settings?.takerFeeRate);

  return {
    id: String(pos._id),
    symbol: pos.symbol,
    side: pos.side,
    marginMode: pos.marginMode,
    leverage: pos.leverage,
    quantity: roundMoney(pos.quantity),
    entryPrice: roundMoney(pos.entryPrice),
    markPrice: roundMoney(mark),
    indexPrice: roundMoney(mark),
    margin: roundMoney(pos.margin),
    takeProfitPrice: pos.takeProfitPrice != null ? roundMoney(pos.takeProfitPrice) : null,
    stopLossPrice: pos.stopLossPrice != null ? roundMoney(pos.stopLossPrice) : null,
    liquidationPrice: liq,
    unrealizedPnl: upnl,
    roe: roePercent(upnl, pos.margin),
    estimatedClosingFee: closeFee,
    tradingFees: roundMoney(pos.tradingFees || 0),
    realizedPnl: roundMoney(pos.realizedPnl || 0),
    status: pos.status,
    closePrice: pos.closePrice != null ? roundMoney(pos.closePrice) : null,
    closeReason: pos.closeReason,
    openedAt: pos.createdAt,
    closedAt: pos.closedAt,
  };
}

async function getWallet(userId, session) {
  const wallet = await Wallet.findOne({ userId }).session(session);
  if (!wallet) throw httpError('Wallet not found', 400);
  return wallet;
}

function availableBalance(wallet) {
  return storeMoney(Math.max(0, wallet.balance - wallet.lockedBalance));
}

async function logTx(session, payload) {
  await Transaction.create([payload], { session });
}

async function createOrder(session, payload) {
  const [order] = await FuturesOrder.create([payload], { session });
  return order;
}

function validateLeverage(leverage, settings) {
  const lev = Number(leverage);
  if (!Number.isFinite(lev) || lev < settings.minLeverage || lev > settings.maxLeverage) {
    throw httpError(`Leverage must be between ${settings.minLeverage}x and ${settings.maxLeverage}x`);
  }
  if (settings.allowedLeverages?.length && !settings.allowedLeverages.includes(lev)) {
    throw httpError('Selected leverage is not allowed');
  }
  return lev;
}

function validateOrderInputs({ quantity, price, settings }) {
  const qty = Number(quantity);
  const px = Number(price);
  if (!Number.isFinite(qty) || qty < settings.minQuantity) {
    throw httpError(`Minimum quantity is ${settings.minQuantity}`);
  }
  const n = notional(qty, px);
  if (n < settings.minOrderNotional) throw httpError(`Minimum order notional is ${settings.minOrderNotional} USDT`);
  if (n > settings.maxOrderNotional) throw httpError(`Maximum order notional is ${settings.maxOrderNotional} USDT`);
  return { qty, px, n };
}

export async function listOpenPositions(userId, { markPrices = {} } = {}) {
  const settings = await getFuturesSettings();
  const rows = await FuturesPosition.find({ userId, status: 'open' }).sort({ createdAt: -1 }).lean();
  return Promise.all(
    rows.map(async (p) => {
      const mark = markPrices[p.symbol] ?? (await resolveMarkPrice(p.symbol).catch(() => p.entryPrice));
      return positionView(p, mark, settings);
    })
  );
}

export async function listPositionHistory(userId, { page = 1, limit = 20 } = {}) {
  const settings = await getFuturesSettings();
  const skip = (Math.max(1, page) - 1) * limit;
  const [rows, total] = await Promise.all([
    FuturesPosition.find({ userId, status: { $in: ['closed', 'liquidated'] } })
      .sort({ closedAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FuturesPosition.countDocuments({ userId, status: { $in: ['closed', 'liquidated'] } }),
  ]);
  return {
    items: rows.map((p) => positionView(p, p.closePrice ?? p.markPrice ?? p.entryPrice, settings)),
    total,
    page,
    limit,
  };
}

export async function listOrderHistory(userId, { page = 1, limit = 30 } = {}) {
  const skip = (Math.max(1, page) - 1) * limit;
  const [rows, total] = await Promise.all([
    FuturesOrder.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    FuturesOrder.countDocuments({ userId }),
  ]);
  return {
    items: rows.map((o) => ({
      id: String(o._id),
      positionId: o.positionId ? String(o.positionId) : null,
      symbol: o.symbol,
      side: o.side,
      orderType: o.orderType,
      action: o.action,
      quantity: roundMoney(o.quantity),
      price: roundMoney(o.price),
      leverage: o.leverage,
      marginMode: o.marginMode,
      fee: roundMoney(o.fee),
      pnl: roundMoney(o.pnl),
      status: o.status,
      note: o.note,
      createdAt: o.createdAt,
    })),
    total,
    page,
    limit,
  };
}

export async function estimateOrder(userId, body) {
  const settings = await getFuturesSettings();
  if (!settings.enabled) throw httpError('Futures trading is disabled', 403);

  const side = body.side === 'short' ? 'short' : 'long';
  const leverage = validateLeverage(body.leverage ?? settings.defaultLeverage, settings);
  const mark = body.limitPrice ? Number(body.limitPrice) : await resolveMarkPrice(body.symbol);
  const { qty, px } = validateOrderInputs({ quantity: body.quantity, price: mark, settings });

  const margin = initialMargin(qty, px, leverage);
  const fee = tradingFee(qty, px, settings.takerFeeRate);
  const liq = liquidationPrice({
    side,
    entryPrice: px,
    quantity: qty,
    margin,
    maintenanceRate: settings.maintenanceMarginRate,
  });

  const wallet = await Wallet.findOne({ userId }).lean();
  const available = wallet ? availableBalance(wallet) : 0;

  return {
    symbol: String(body.symbol).toUpperCase(),
    side,
    quantity: qty,
    price: px,
    leverage,
    marginMode: body.marginMode === 'isolated' ? 'isolated' : 'cross',
    requiredMargin: margin,
    estimatedFee: fee,
    totalRequired: storeMoney(margin + fee),
    liquidationPrice: liq,
    availableBalance: available,
    sufficient: available >= storeMoney(margin + fee),
  };
}

export async function openPosition(userId, body, { io } = {}) {
  const settings = await getFuturesSettings();
  if (!settings.enabled) throw httpError('Futures trading is disabled', 403);

  const symbol = String(body.symbol || '').toUpperCase();
  if (!symbol) throw httpError('Symbol is required');

  const side = body.side === 'short' ? 'short' : 'long';
  const marginMode = body.marginMode === 'isolated' ? 'isolated' : 'cross';
  const orderType = body.orderType === 'limit' ? 'limit' : 'market';
  const leverage = validateLeverage(body.leverage ?? settings.defaultLeverage, settings);

  let execPrice = orderType === 'limit' ? Number(body.limitPrice) : await resolveMarkPrice(symbol);
  if (orderType === 'limit' && (!Number.isFinite(execPrice) || execPrice <= 0)) {
    throw httpError('Valid limit price is required');
  }

  const { qty } = validateOrderInputs({ quantity: body.quantity, price: execPrice, settings });
  const tpErr = validateTpSl({
    side,
    entryPrice: execPrice,
    takeProfitPrice: body.takeProfitPrice,
    stopLossPrice: body.stopLossPrice,
  });
  if (tpErr) throw httpError(tpErr);

  const marginNeeded = initialMargin(qty, execPrice, leverage);
  const openFee = tradingFee(qty, execPrice, settings.takerFeeRate);
  const totalLock = storeMoney(marginNeeded + openFee);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const wallet = await getWallet(userId, session);
    if (availableBalance(wallet) < totalLock) throw httpError('Insufficient available balance');

    wallet.balance = storeMoney(wallet.balance - openFee);
    wallet.lockedBalance = storeMoney(wallet.lockedBalance + marginNeeded);
    await wallet.save({ session });

    let position = await FuturesPosition.findOne({ userId, symbol, side, marginMode, status: 'open' }).session(session);

    if (position) {
      const oldQty = Number(position.quantity);
      const newQty = storeMoney(oldQty + qty);
      const avgEntry = storeMoney((position.entryPrice * oldQty + execPrice * qty) / newQty);
      position.quantity = newQty;
      position.entryPrice = avgEntry;
      position.margin = storeMoney(Number(position.margin) + marginNeeded);
      position.leverage = leverage;
      position.tradingFees = storeMoney(Number(position.tradingFees || 0) + openFee);
      if (body.takeProfitPrice != null && body.takeProfitPrice !== '') {
        position.takeProfitPrice = storeMoney(Number(body.takeProfitPrice));
      }
      if (body.stopLossPrice != null && body.stopLossPrice !== '') {
        position.stopLossPrice = storeMoney(Number(body.stopLossPrice));
      }
    } else {
      position = new FuturesPosition({
        userId,
        symbol,
        side,
        marginMode,
        leverage,
        quantity: qty,
        entryPrice: execPrice,
        markPrice: execPrice,
        margin: marginNeeded,
        takeProfitPrice:
          body.takeProfitPrice != null && body.takeProfitPrice !== '' ? storeMoney(Number(body.takeProfitPrice)) : null,
        stopLossPrice:
          body.stopLossPrice != null && body.stopLossPrice !== '' ? storeMoney(Number(body.stopLossPrice)) : null,
        tradingFees: openFee,
        status: 'open',
      });
    }

    position.liquidationPrice = liquidationPrice({
      side,
      entryPrice: position.entryPrice,
      quantity: position.quantity,
      margin: position.margin,
      maintenanceRate: settings.maintenanceMarginRate,
    });
    position.markPrice = execPrice;
    position.unrealizedPnl = 0;
    await position.save({ session });

    await createOrder(session, {
      userId,
      positionId: position._id,
      symbol,
      side,
      orderType,
      action: 'open',
      quantity: qty,
      price: execPrice,
      leverage,
      marginMode,
      marginDelta: marginNeeded,
      fee: openFee,
      pnl: 0,
      status: 'filled',
    });

    await logTx(session, {
      userId,
      type: 'futures_margin_locked',
      amount: roundMoney(-marginNeeded),
      balanceAfter: roundMoney(wallet.balance),
      currency: 'USDT',
      status: 'completed',
      reference: `futures_open:${position._id}`,
    });

    if (openFee > 0) {
      await logTx(session, {
        userId,
        type: 'futures_fee',
        amount: roundMoney(-openFee),
        balanceAfter: roundMoney(wallet.balance),
        currency: 'USDT',
        status: 'completed',
        reference: `futures_fee_open:${position._id}`,
      });
    }

    await session.commitTransaction();

    const view = positionView(position.toObject(), execPrice, settings);
    if (io) {
      await emitWalletUpdate(io, userId, { reason: 'futures_open' });
      emitFuturesUpdate(io, userId, { positions: [view], event: 'position:opened' });
    }
    return view;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function closePosition(userId, positionId, { quantity, reason = 'manual', io } = {}) {
  const settings = await getFuturesSettings();
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const position = await FuturesPosition.findOne({ _id: positionId, userId, status: 'open' }).session(session);
    if (!position) throw httpError('Open position not found', 404);

    const closeQty = quantity != null ? Number(quantity) : Number(position.quantity);
    if (!Number.isFinite(closeQty) || closeQty <= 0 || closeQty > position.quantity) {
      throw httpError('Invalid close quantity');
    }

    const mark = await resolveMarkPrice(position.symbol);
    const isPartial = closeQty < position.quantity;
    const marginPortion = storeMoney((position.margin * closeQty) / position.quantity);
    const pnlRaw = unrealizedPnl({
      side: position.side,
      quantity: closeQty,
      entryPrice: position.entryPrice,
      markPrice: mark,
    });
    const pnl = storeMoney(Math.max(pnlRaw, -marginPortion));
    const closeFee = tradingFee(closeQty, mark, settings.takerFeeRate);
    const returnAmount = storeMoney(Math.max(0, marginPortion + pnl - closeFee));

    const wallet = await getWallet(userId, session);
    if (wallet.lockedBalance < marginPortion) throw httpError('Insufficient locked margin');

    wallet.lockedBalance = storeMoney(wallet.lockedBalance - marginPortion);
    wallet.balance = storeMoney(wallet.balance + returnAmount);
    await wallet.save({ session });

    const action = isPartial ? 'partial_close' : reason === 'manual' ? 'close' : reason;
    await createOrder(session, {
      userId,
      positionId: position._id,
      symbol: position.symbol,
      side: position.side,
      orderType: 'market',
      action,
      quantity: closeQty,
      price: mark,
      leverage: position.leverage,
      marginMode: position.marginMode,
      marginDelta: -marginPortion,
      fee: closeFee,
      pnl,
      status: 'filled',
    });

    if (pnl > 0) {
      await logTx(session, {
        userId,
        type: 'futures_profit',
        amount: roundMoney(pnl),
        balanceAfter: roundMoney(wallet.balance),
        currency: 'USDT',
        status: 'completed',
        reference: `futures_profit:${position._id}`,
      });
    } else if (pnl < 0) {
      await logTx(session, {
        userId,
        type: 'futures_loss',
        amount: roundMoney(pnl),
        balanceAfter: roundMoney(wallet.balance),
        currency: 'USDT',
        status: 'completed',
        reference: `futures_loss:${position._id}`,
      });
    }

    if (closeFee > 0) {
      await logTx(session, {
        userId,
        type: 'futures_fee',
        amount: roundMoney(-closeFee),
        balanceAfter: roundMoney(wallet.balance),
        currency: 'USDT',
        status: 'completed',
        reference: `futures_fee_close:${position._id}`,
      });
    }

    await logTx(session, {
      userId,
      type: 'futures_margin_returned',
      amount: roundMoney(marginPortion),
      balanceAfter: roundMoney(wallet.balance),
      currency: 'USDT',
      status: 'completed',
      reference: `futures_close:${position._id}`,
    });

    if (isPartial) {
      const remainQty = storeMoney(position.quantity - closeQty);
      const remainMargin = storeMoney(position.margin - marginPortion);
      position.quantity = remainQty;
      position.margin = remainMargin;
      position.realizedPnl = storeMoney(Number(position.realizedPnl || 0) + pnl);
      position.tradingFees = storeMoney(Number(position.tradingFees || 0) + closeFee);
      position.liquidationPrice = liquidationPrice({
        side: position.side,
        entryPrice: position.entryPrice,
        quantity: remainQty,
        margin: remainMargin,
        maintenanceRate: settings.maintenanceMarginRate,
      });
      position.markPrice = mark;
      position.unrealizedPnl = unrealizedPnl({
        side: position.side,
        quantity: remainQty,
        entryPrice: position.entryPrice,
        markPrice: mark,
      });
      await position.save({ session });
    } else {
      position.status = reason === 'liquidation' ? 'liquidated' : 'closed';
      position.closeReason = reason;
      position.closePrice = mark;
      position.closedAt = new Date();
      position.realizedPnl = storeMoney(Number(position.realizedPnl || 0) + pnl);
      position.tradingFees = storeMoney(Number(position.tradingFees || 0) + closeFee);
      position.unrealizedPnl = 0;
      position.markPrice = mark;
      await position.save({ session });
    }

    await session.commitTransaction();

    const view = positionView(position.toObject(), mark, settings);
    if (io) {
      await emitWalletUpdate(io, userId, { reason: 'futures_close' });
      emitFuturesUpdate(io, userId, {
        positions: position.status === 'open' ? [view] : [],
        closed: position.status !== 'open' ? view : null,
        event: isPartial ? 'position:partial_close' : 'position:closed',
      });
    }
    return view;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function editPositionTpSl(userId, positionId, { takeProfitPrice, stopLossPrice }, { io } = {}) {
  const settings = await getFuturesSettings();
  const position = await FuturesPosition.findOne({ _id: positionId, userId, status: 'open' });
  if (!position) throw httpError('Open position not found', 404);

  const tp = takeProfitPrice != null && takeProfitPrice !== '' ? Number(takeProfitPrice) : null;
  const sl = stopLossPrice != null && stopLossPrice !== '' ? Number(stopLossPrice) : null;
  const tpErr = validateTpSl({
    side: position.side,
    entryPrice: position.entryPrice,
    takeProfitPrice: tp,
    stopLossPrice: sl,
  });
  if (tpErr) throw httpError(tpErr);

  position.takeProfitPrice = tp != null ? storeMoney(tp) : null;
  position.stopLossPrice = sl != null ? storeMoney(sl) : null;
  await position.save();

  const mark = await resolveMarkPrice(position.symbol).catch(() => position.entryPrice);
  const view = positionView(position.toObject(), mark, settings);
  if (io) emitFuturesUpdate(io, userId, { positions: [view], event: 'position:updated' });
  return view;
}

export async function adjustPositionMargin(userId, positionId, { amount, action }, { io } = {}) {
  const settings = await getFuturesSettings();
  const delta = Number(amount);
  if (!Number.isFinite(delta) || delta <= 0) throw httpError('Valid amount is required');

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const position = await FuturesPosition.findOne({ _id: positionId, userId, status: 'open' }).session(session);
    if (!position) throw httpError('Open position not found', 404);

    const wallet = await getWallet(userId, session);

    if (action === 'add') {
      if (availableBalance(wallet) < delta) throw httpError('Insufficient available balance');
      wallet.balance = storeMoney(wallet.balance);
      wallet.lockedBalance = storeMoney(wallet.lockedBalance + delta);
      position.margin = storeMoney(position.margin + delta);
    } else if (action === 'reduce') {
      const maxReduce = storeMoney(Math.max(0, position.margin - initialMargin(position.quantity, position.entryPrice, position.leverage)));
      const reduceBy = storeMoney(Math.min(delta, maxReduce));
      if (reduceBy <= 0) throw httpError('Cannot reduce margin below required initial margin');
      if (wallet.lockedBalance < reduceBy) throw httpError('Insufficient locked balance');
      wallet.lockedBalance = storeMoney(wallet.lockedBalance - reduceBy);
      position.margin = storeMoney(position.margin - reduceBy);
    } else {
      throw httpError('Action must be add or reduce');
    }

    await wallet.save({ session });

    position.liquidationPrice = liquidationPrice({
      side: position.side,
      entryPrice: position.entryPrice,
      quantity: position.quantity,
      margin: position.margin,
      maintenanceRate: settings.maintenanceMarginRate,
    });
    await position.save({ session });

    await createOrder(session, {
      userId,
      positionId: position._id,
      symbol: position.symbol,
      side: position.side,
      orderType: 'market',
      action: action === 'add' ? 'add_margin' : 'reduce_margin',
      quantity: 0,
      price: position.markPrice || position.entryPrice,
      leverage: position.leverage,
      marginMode: position.marginMode,
      marginDelta: action === 'add' ? delta : -delta,
      fee: 0,
      pnl: 0,
      status: 'filled',
    });

    await session.commitTransaction();

    const mark = await resolveMarkPrice(position.symbol).catch(() => position.entryPrice);
    const view = positionView(position.toObject(), mark, settings);
    if (io) {
      await emitWalletUpdate(io, userId, { reason: 'futures_margin_adjust' });
      emitFuturesUpdate(io, userId, { positions: [view], event: 'position:updated' });
    }
    return view;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function reversePosition(userId, positionId, { io } = {}) {
  const position = await FuturesPosition.findOne({ _id: positionId, userId, status: 'open' });
  if (!position) throw httpError('Open position not found', 404);

  const qty = position.quantity;
  const leverage = position.leverage;
  const marginMode = position.marginMode;
  const symbol = position.symbol;
  const newSide = position.side === 'long' ? 'short' : 'long';

  await closePosition(userId, positionId, { reason: 'reverse', io });
  return openPosition(
    userId,
    { symbol, side: newSide, quantity: qty, leverage, marginMode, orderType: 'market' },
    { io }
  );
}

export async function adminListPositions({ status = 'open', page = 1, limit = 50 } = {}) {
  const settings = await getFuturesSettings();
  const filter = status === 'all' ? {} : { status };
  const skip = (Math.max(1, page) - 1) * limit;
  const [rows, total] = await Promise.all([
    FuturesPosition.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).populate('userId', 'email name').lean(),
    FuturesPosition.countDocuments(filter),
  ]);
  return {
    items: rows.map((p) => ({
      ...positionView(p, p.markPrice ?? p.entryPrice, settings),
      user: p.userId ? { id: String(p.userId._id), email: p.userId.email, name: p.userId.name } : null,
    })),
    total,
    page,
    limit,
  };
}

export async function adminForceClose(positionId, { io } = {}) {
  const position = await FuturesPosition.findById(positionId);
  if (!position || position.status !== 'open') throw httpError('Open position not found', 404);
  return closePosition(String(position.userId), positionId, { reason: 'admin', io });
}

export { positionView, shouldTriggerTpSl, isLiquidated, resolveMarkPrice };
