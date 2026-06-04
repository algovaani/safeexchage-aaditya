import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Wallet } from '../models/Wallet.js';
import { signToken } from '../utils/token.js';

const DEMO_BALANCE = 10_000;

export async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, passwordHash, name: name || '' });
    await Wallet.create({ userId: user._id, currency: 'USDT', balance: DEMO_BALANCE });

    const token = signToken(user);
    res.status(201).json({
      token,
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    next(e);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    next(e);
  }
}

export async function me(req, res, next) {
  try {
    const user = await User.findById(req.userId).select('-passwordHash').lean();
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    });
  } catch (e) {
    next(e);
  }
}
