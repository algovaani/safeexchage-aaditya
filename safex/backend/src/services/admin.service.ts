import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { creditWallet, debitWallet } from './wallet.service.js';
import { generateOtp, sendEmail } from './email.service.js';
import { signAccessToken, signRefreshToken, refreshExpiresAt } from '../utils/jwt.js';

export async function adminLogin(email: string, password: string, otp?: string, deviceInfo?: string, ip?: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.role !== 'ADMIN') throw Object.assign(new Error('Invalid admin credentials'), { status: 401 });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw Object.assign(new Error('Invalid admin credentials'), { status: 401 });

  if (!otp) {
    const code = generateOtp();
    await prisma.emailOtp.create({
      data: {
        userId: user.id,
        code,
        purpose: 'ADMIN_LOGIN',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    const target = process.env.ADMIN_EMAIL || user.email;
    await sendEmail(target, 'SafeXchange Admin OTP', `Your admin login OTP is: ${code}`);
    return { otpSent: true, email: user.email };
  }

  const record = await prisma.emailOtp.findFirst({
    where: {
      userId: user.id,
      purpose: 'ADMIN_LOGIN',
      code: otp,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw Object.assign(new Error('Invalid or expired OTP'), { status: 400 });

  await prisma.emailOtp.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = signRefreshToken({ sub: user.id, role: user.role });
  await prisma.session.create({
    data: { userId: user.id, refreshToken, deviceInfo, ipAddress: ip, expiresAt: refreshExpiresAt() },
  });

  return {
    otpSent: false,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    accessToken,
    refreshToken,
  };
}

export async function listUsers(search?: string, status?: string, page = 1, limit = 20) {
  const where: Record<string, unknown> = {};
  if (status && status !== 'ALL') where.status = status;
  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { mobile: { contains: search } },
      { name: { contains: search, mode: 'insensitive' } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        wallet: true,
        kyc: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total, page, limit };
}

export async function getUserDetail(id: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id },
    include: {
      wallet: true,
      kyc: true,
      deposits: { take: 10, orderBy: { createdAt: 'desc' } },
      orders: { take: 10, orderBy: { createdAt: 'desc' }, include: { trade: { include: { pair: true } } } },
      stakes: { take: 10, include: { plan: true } },
    },
  });
}

export async function toggleUserBlock(id: string, block: boolean) {
  return prisma.user.update({
    where: { id },
    data: { status: block ? 'BLOCKED' : 'ACTIVE' },
  });
}

export async function adjustBalance(userId: string, amount: number, credit: boolean, reason: string) {
  if (credit) {
    await creditWallet({ userId, amount, type: 'ADMIN_ADJUST', reason });
  } else {
    await debitWallet({ userId, amount, type: 'ADMIN_ADJUST', reason });
  }
}

export async function dashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [users, kycPending, deposits, activeTrades, activeStakes, revenue] = await Promise.all([
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.kYC.count({ where: { status: 'PENDING' } }),
    prisma.deposit.aggregate({ where: { status: 'APPROVED' }, _sum: { amount: true } }),
    prisma.trade.count({ where: { status: 'OPEN' } }),
    prisma.stake.count({ where: { status: 'ACTIVE' } }),
    prisma.walletTransaction.aggregate({
      where: { type: 'TRADE_PNL', amount: { lt: 0 } },
      _sum: { amount: true },
    }),
  ]);

  return {
    totalUsers: users,
    kycPending,
    totalDeposits: deposits._sum.amount || 0,
    activeTrades,
    activeStakes,
    platformRevenue: new Prisma.Decimal(revenue._sum.amount || 0).abs(),
  };
}

export async function getSettings() {
  const rows = await prisma.platformSettings.findMany();
  const map: Record<string, unknown> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    bankName: map.bankName || process.env.PLATFORM_BANK_NAME,
    bankAccount: map.bankAccount || process.env.PLATFORM_BANK_ACCOUNT,
    bankIfsc: map.bankIfsc || process.env.PLATFORM_BANK_IFSC,
    usdtAddress: map.usdtAddress || process.env.PLATFORM_USDT_ADDRESS,
    maintenanceMode: map.maintenanceMode ?? false,
    smtp: map.smtp || {},
  };
}

export async function updateSettings(key: string, value: unknown) {
  return prisma.platformSettings.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}

export async function walletTransactions(userId: string, page = 1, limit = 20) {
  const [items, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.walletTransaction.count({ where: { userId } }),
  ]);
  return { items, total, page, limit };
}
