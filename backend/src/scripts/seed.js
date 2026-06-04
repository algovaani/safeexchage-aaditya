import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Wallet } from '../models/Wallet.js';

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing');

  await mongoose.connect(uri);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@vencrypto.local';
  const adminPass = process.env.ADMIN_PASSWORD || 'ChangeMeAdmin123!';
  const liqEmail = process.env.SYSTEM_LIQUIDITY_EMAIL || 'liquidity@internal.vencrypto';
  const liqPass = process.env.SYSTEM_LIQUIDITY_PASSWORD || 'LiquidityInternal123!';

  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    const passwordHash = await bcrypt.hash(adminPass, 12);
    admin = await User.create({
      email: adminEmail,
      passwordHash,
      name: 'Admin',
      role: 'admin',
    });
    await Wallet.create({ userId: admin._id, currency: 'USDT', balance: 0 });
    console.log('Created admin:', adminEmail);
  } else {
    console.log('Admin already exists:', adminEmail);
  }

  let liq = await User.findOne({ email: liqEmail });
  if (!liq) {
    const passwordHash = await bcrypt.hash(liqPass, 12);
    liq = await User.create({
      email: liqEmail,
      passwordHash,
      name: 'Liquidity',
      role: 'system',
    });
    await Wallet.create({ userId: liq._id, currency: 'USDT', balance: 1e12 });
    console.log('Created liquidity user:', liqEmail);
  } else {
    console.log('Liquidity user already exists:', liqEmail);
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
