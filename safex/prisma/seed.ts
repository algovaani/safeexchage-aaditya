import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PAIRS = [
  ['BTCUSDT', 'BTC', 'USDT'],
  ['ETHUSDT', 'ETH', 'USDT'],
  ['BNBUSDT', 'BNB', 'USDT'],
  ['SOLUSDT', 'SOL', 'USDT'],
  ['XRPUSDT', 'XRP', 'USDT'],
  ['DOGEUSDT', 'DOGE', 'USDT'],
  ['ADAUSDT', 'ADA', 'USDT'],
  ['TRXUSDT', 'TRX', 'USDT'],
  ['AVAXUSDT', 'AVAX', 'USDT'],
  ['LINKUSDT', 'LINK', 'USDT'],
] as const;

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@safex.local';
  const adminPass = process.env.ADMIN_PASSWORD || 'ChangeMeAdmin123!';
  const adminMobile = process.env.ADMIN_MOBILE || '+919999999999';
  const hash = await bcrypt.hash(adminPass, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash: hash, role: 'ADMIN' },
    create: {
      email: adminEmail,
      mobile: adminMobile,
      name: 'SafeXchange Admin',
      passwordHash: hash,
      role: 'ADMIN',
      emailVerified: true,
      wallet: { create: {} },
      kyc: { create: { status: 'APPROVED' } },
    },
  });

  for (const [symbol, base, quote] of PAIRS) {
    await prisma.tradingPair.upsert({
      where: { symbol },
      update: {},
      create: { symbol, baseAsset: base, quoteAsset: quote },
    });
  }

  const plans = [
    { name: '12 Months', apy: 102, lockDays: 365, minAmount: 100, maxAmount: 1000000 },
    { name: '18 Months', apy: 180, lockDays: 548, minAmount: 100, maxAmount: 1000000 },
    { name: '24 Months', apy: 210, lockDays: 730, minAmount: 100, maxAmount: 1000000 },
    { name: '36 Months', apy: 240, lockDays: 1095, minAmount: 100, maxAmount: 1000000 },
  ];

  await prisma.stakingPlan.updateMany({
    where: { name: { in: ['Starter', 'Growth', 'Pro'] } },
    data: { isActive: false },
  });

  for (const p of plans) {
    const existing = await prisma.stakingPlan.findFirst({ where: { name: p.name } });
    if (existing) {
      await prisma.stakingPlan.update({ where: { id: existing.id }, data: { ...p, isActive: true } });
    } else {
      await prisma.stakingPlan.create({ data: p });
    }
  }

  console.log('Seed complete — admin:', adminEmail);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
