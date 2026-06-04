import { Wallet } from '../models/Wallet.js';
import { Transaction } from '../models/Transaction.js';

export async function balance(req, res, next) {
  try {
    const w = await Wallet.findOne({ userId: req.userId }).lean();
    res.json(w || { balance: 0, lockedBalance: 0, currency: 'USDT' });
  } catch (e) {
    next(e);
  }
}

export async function deposit(req, res, next) {
  try {
    const { amount, reference } = req.body;
    const tx = await Transaction.create({
      userId: req.userId,
      type: 'deposit',
      amount,
      status: 'pending',
      method: 'manual',
      reference: reference || '',
    });
    res.status(201).json(tx);
  } catch (e) {
    next(e);
  }
}

export async function withdraw(req, res, next) {
  try {
    const { amount } = req.body;
    const tx = await Transaction.create({
      userId: req.userId,
      type: 'withdrawal',
      amount,
      status: 'pending',
      method: 'manual',
    });
    res.status(201).json(tx);
  } catch (e) {
    next(e);
  }
}

export async function transactions(req, res, next) {
  try {
    const list = await Transaction.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(100).lean();
    res.json(list);
  } catch (e) {
    next(e);
  }
}
