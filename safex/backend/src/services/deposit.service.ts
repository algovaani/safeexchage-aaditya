import { DepositType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { uploadBuffer } from '../lib/cloudinary.js';
import { creditWallet } from './wallet.service.js';

export async function createCryptoDeposit(
  userId: string,
  data: { txHash: string; amount: number; walletAddress: string }
) {
  return prisma.deposit.create({
    data: {
      userId,
      type: 'CRYPTO',
      amount: data.amount,
      txHash: data.txHash,
      walletAddress: data.walletAddress,
      status: 'PENDING',
    },
  });
}

export async function createFiatDeposit(
  userId: string,
  data: { amount: number; bankName: string; accountNumber: string; utrNumber: string },
  proof?: Express.Multer.File
) {
  let paymentProofUrl: string | undefined;
  if (proof) {
    paymentProofUrl = await uploadBuffer(proof.buffer, `deposits/${userId}`, 'proof', proof.mimetype);
  }
  return prisma.deposit.create({
    data: {
      userId,
      type: 'FIAT',
      amount: data.amount,
      bankName: data.bankName,
      accountNumber: data.accountNumber,
      utrNumber: data.utrNumber,
      paymentProofUrl,
      status: 'PENDING',
    },
  });
}

export async function myDeposits(userId: string) {
  return prisma.deposit.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listDepositsAdmin(opts: {
  type?: DepositType;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { type, status, search, page = 1, limit = 20 } = opts;
  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (status && status !== 'ALL') where.status = status;
  if (search) {
    where.OR = [
      { utrNumber: { contains: search, mode: 'insensitive' } },
      { txHash: { contains: search, mode: 'insensitive' } },
      { user: { email: { contains: search, mode: 'insensitive' } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.deposit.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.deposit.count({ where }),
  ]);
  return { items, total, page, limit };
}

export async function approveDeposit(id: string, adminId: string) {
  const deposit = await prisma.deposit.findUniqueOrThrow({ where: { id } });
  if (deposit.status !== 'PENDING') throw new Error('Deposit already processed');

  await prisma.deposit.update({
    where: { id },
    data: { status: 'APPROVED', approvedBy: adminId, approvedAt: new Date() },
  });
  await creditWallet({
    userId: deposit.userId,
    amount: deposit.amount,
    type: 'DEPOSIT',
    reason: `${deposit.type} deposit approved`,
    referenceId: deposit.id,
  });
  return deposit;
}

export async function rejectDeposit(id: string, adminId: string, note: string) {
  return prisma.deposit.update({
    where: { id },
    data: { status: 'REJECTED', adminNote: note, approvedBy: adminId, approvedAt: new Date() },
  });
}

export async function depositStats() {
  const [pending, approvedToday, volume] = await Promise.all([
    prisma.deposit.count({ where: { status: 'PENDING' } }),
    prisma.deposit.count({
      where: { status: 'APPROVED', approvedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.deposit.aggregate({
      where: { status: 'APPROVED' },
      _sum: { amount: true },
    }),
  ]);
  return { pending, approvedToday, totalVolume: volume._sum.amount || 0 };
}
