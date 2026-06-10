import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { resolveMongoUri } from '../config/resolveMongoUri.js';
import { User } from '../models/User.js';
import { Wallet } from '../models/Wallet.js';

async function upsertUser({ email, password, name, role, walletBalance }) {
  const passwordHash = await bcrypt.hash(password, 12);
  let user = await User.findOne({ email });

  if (!user && role === 'admin') {
    user = await User.findOne({ role: 'admin' });
    if (user) {
      user.email = email;
      user.name = name;
      user.passwordHash = passwordHash;
      user.role = role;
      await user.save();
      console.log('Updated admin:', email);
      return user;
    }
  }

  if (!user && role === 'system') {
    user = await User.findOne({ role: 'system' });
    if (user) {
      user.email = email;
      user.name = name;
      user.passwordHash = passwordHash;
      user.role = role;
      await user.save();
      console.log('Updated liquidity user:', email);
      return user;
    }
  }

  if (!user) {
    user = await User.create({ email, passwordHash, name, role });
    await Wallet.create({ userId: user._id, currency: 'USDT', balance: walletBalance });
    console.log('Created', role, ':', email);
    return user;
  }

  user.passwordHash = passwordHash;
  user.name = name;
  user.role = role;
  await user.save();
  const wallet = await Wallet.findOne({ userId: user._id });
  if (!wallet) {
    await Wallet.create({ userId: user._id, currency: 'USDT', balance: walletBalance });
  }
  console.log('Reset password for', role, ':', email);
  return user;
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing');

  const resolved = await resolveMongoUri(uri);
  await mongoose.connect(resolved, { serverSelectionTimeoutMS: 20_000 });

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@safex.local';
  const adminPass = process.env.ADMIN_PASSWORD || 'ChangeMeAdmin123!';
  const liqEmail = process.env.SYSTEM_LIQUIDITY_EMAIL || 'liquidity@internal.safex';
  const liqPass = process.env.SYSTEM_LIQUIDITY_PASSWORD || 'LiquidityInternal123!';

  await upsertUser({
    email: adminEmail,
    password: adminPass,
    name: 'Admin',
    role: 'admin',
    walletBalance: 0,
  });

  await upsertUser({
    email: liqEmail,
    password: liqPass,
    name: 'Liquidity',
    role: 'system',
    walletBalance: 1e12,
  });

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
