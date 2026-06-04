import { User } from '../models/User.js';
import { KycDetail } from '../models/KycDetail.js';
import { Transaction } from '../models/Transaction.js';
import { Wallet } from '../models/Wallet.js';
import { ManualPriceData } from '../models/ManualPriceData.js';
import { Trade } from '../models/Trade.js';
import { Order } from '../models/Order.js';
import { mergeCandles } from '../services/mergeService.js';
import { fetchKlines } from '../services/binanceService.js';

export async function listUsers(_req, res, next) {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 }).limit(500).lean();
    res.json(users);
  } catch (e) {
    next(e);
  }
}

export async function updateKyc(req, res, next) {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;
    const k = await KycDetail.findByIdAndUpdate(
      id,
      { status, adminNote, reviewedBy: req.userId },
      { new: true }
    );
    if (!k) return res.status(404).json({ error: 'Not found' });
    res.json(k);
  } catch (e) {
    next(e);
  }
}

export async function listPendingTransactions(_req, res, next) {
  try {
    const txs = await Transaction.find({ status: 'pending' }).sort({ createdAt: -1 }).lean();
    res.json(txs);
  } catch (e) {
    next(e);
  }
}

export async function listAllTransactions(_req, res, next) {
  try {
    const txs = await Transaction.find().sort({ createdAt: -1 }).limit(1000).lean();
    res.json(txs);
  } catch (e) {
    next(e);
  }
}

export async function listAllOrders(_req, res, next) {
  try {
    const orders = await Order.find().sort({ createdAt: -1 }).limit(1000).lean();
    res.json(orders);
  } catch (e) {
    next(e);
  }
}

export async function approveTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const { decision } = req.body;
    const tx = await Transaction.findById(id);
    if (!tx) return res.status(404).json({ error: 'Not found' });
    if (tx.status !== 'pending') return res.status(400).json({ error: 'Already processed' });

    if (decision === 'approve' && tx.type === 'deposit') {
      await Wallet.findOneAndUpdate(
        { userId: tx.userId },
        { $inc: { balance: tx.amount } },
        { upsert: true }
      );
      tx.status = 'completed';
    } else if (decision === 'approve' && tx.type === 'withdrawal') {
      const w = await Wallet.findOne({ userId: tx.userId });
      if (!w || w.balance < tx.amount) return res.status(400).json({ error: 'Insufficient balance' });
      w.balance -= tx.amount;
      await w.save();
      tx.status = 'completed';
    } else if (decision === 'reject') {
      tx.status = 'rejected';
    } else {
      return res.status(400).json({ error: 'Invalid decision' });
    }

    await tx.save();
    res.json(tx);
  } catch (e) {
    next(e);
  }
}

export async function upsertManualPrice(req, res, next) {
  try {
    const body = req.body;
    const existing = await ManualPriceData.findOne({
      symbol: body.symbol.toUpperCase(),
      interval: body.interval,
      openTime: body.openTime,
    }).sort({ revision: -1 });

    const revision = (existing?.revision || 0) + 1;

    const doc = await ManualPriceData.create({
      symbol: body.symbol.toUpperCase(),
      interval: body.interval,
      openTime: body.openTime,
      mode: body.mode || 'candle',
      open: body.open,
      high: body.high,
      low: body.low,
      close: body.close,
      volume: body.volume ?? 0,
      tickTime: body.tickTime,
      price: body.price,
      revision,
      createdBy: req.userId,
    });

    const io = req.app.get('io');
    if (io) {
      const binance = await fetchKlines(doc.symbol, doc.interval, {
        startTime: doc.openTime,
        endTime: doc.openTime,
        limit: 5,
      });
      const manual = await ManualPriceData.find({
        symbol: doc.symbol,
        interval: doc.interval,
        openTime: doc.openTime,
      })
        .sort({ revision: 1 })
        .lean();
      const merged = mergeCandles(binance.length ? binance : [stubCandle(doc)], manual);
      io.to(`m:${doc.symbol}:${doc.interval}`).emit('market:manual:updated', {
        candles: merged,
      });
    }

    res.status(201).json(doc);
  } catch (e) {
    next(e);
  }
}

function stubCandle(doc) {
  return {
    openTime: doc.openTime,
    open: doc.open ?? doc.price ?? 0,
    high: doc.high ?? doc.price ?? 0,
    low: doc.low ?? doc.price ?? 0,
    close: doc.close ?? doc.price ?? 0,
    volume: doc.volume ?? 0,
    isFinal: true,
  };
}

export async function listManualPrices(req, res, next) {
  try {
    const { symbol, interval } = req.query;
    const q = {};
    if (symbol) q.symbol = String(symbol).toUpperCase();
    if (interval) q.interval = String(interval);
    const rows = await ManualPriceData.find(q).sort({ openTime: -1 }).limit(200).lean();
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function deleteManualPrice(req, res, next) {
  try {
    await ManualPriceData.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function allTrades(_req, res, next) {
  try {
    const trades = await Trade.find().sort({ createdAt: -1 }).limit(500).lean();
    res.json(trades);
  } catch (e) {
    next(e);
  }
}

export async function listKyc(_req, res, next) {
  try {
    const rows = await KycDetail.find().sort({ createdAt: -1 }).limit(200).lean();
    res.json(rows);
  } catch (e) {
    next(e);
  }
}
