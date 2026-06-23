import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { sendEmail, generateOtp } from './email.service.js';
import { signAccessToken, signRefreshToken, refreshExpiresAt } from '../utils/jwt.js';

const BCRYPT_ROUNDS = 12;

function publicUser(user: {
  id: string;
  name: string | null;
  email: string;
  mobile: string | null;
  role: string;
  status: string;
  emailVerified: boolean;
  mobileVerified: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    mobileVerified: user.mobileVerified,
    createdAt: user.createdAt,
  };
}

async function issueTokens(userId: string, role: string, deviceInfo?: string, ip?: string) {
  const accessToken = signAccessToken({ sub: userId, role });
  const refreshToken = signRefreshToken({ sub: userId, role });
  await prisma.session.create({
    data: {
      userId,
      refreshToken,
      deviceInfo,
      ipAddress: ip,
      expiresAt: refreshExpiresAt(),
    },
  });
  return { accessToken, refreshToken };
}

export async function registerUser(input: {
  name?: string;
  email: string;
  mobile?: string;
  password: string;
  deviceInfo?: string;
  ip?: string;
}) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, ...(input.mobile ? [{ mobile: input.mobile }] : [])] },
  });
  if (existing) throw Object.assign(new Error('Email or mobile already registered'), { status: 409 });

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      mobile: input.mobile,
      passwordHash,
      wallet: { create: { balance: 0, lockedBalance: 0 } },
      kyc: { create: { status: 'NOT_SUBMITTED' } },
    },
  });

  const otp = generateOtp();
  await prisma.emailOtp.create({
    data: {
      userId: user.id,
      code: otp,
      purpose: 'VERIFY_EMAIL',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });
  await sendEmail(user.email, 'SafeXchange — Verify your email', `Your verification OTP is: ${otp}`);

  const tokens = await issueTokens(user.id, user.role, input.deviceInfo, input.ip);
  return { user: publicUser(user), ...tokens };
}

export async function verifyEmail(email: string, otp: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const record = await prisma.emailOtp.findFirst({
    where: {
      userId: user.id,
      purpose: 'VERIFY_EMAIL',
      code: otp,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw Object.assign(new Error('Invalid or expired OTP'), { status: 400 });

  await prisma.$transaction([
    prisma.emailOtp.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
  ]);
  return publicUser({ ...user, emailVerified: true });
}

export async function loginUser(input: {
  emailOrMobile: string;
  password: string;
  deviceInfo?: string;
  ip?: string;
}) {
  const id = input.emailOrMobile.trim();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: id.toLowerCase() }, { mobile: id }] },
  });
  if (!user) throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  if (user.status === 'BLOCKED') throw Object.assign(new Error('Account blocked'), { status: 403 });

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

  const tokens = await issueTokens(user.id, user.role, input.deviceInfo, input.ip);
  return { user: publicUser(user), ...tokens };
}

export async function refreshSession(refreshToken: string) {
  const session = await prisma.session.findUnique({ where: { refreshToken }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) {
    throw Object.assign(new Error('Invalid refresh token'), { status: 401 });
  }
  const accessToken = signAccessToken({ sub: session.userId, role: session.user.role });
  return { accessToken, user: publicUser(session.user) };
}

export async function logoutSession(refreshToken: string) {
  await prisma.session.deleteMany({ where: { refreshToken } });
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const otp = generateOtp();
  await prisma.emailOtp.create({
    data: {
      userId: user.id,
      code: otp,
      purpose: 'RESET_PASSWORD',
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });
  await sendEmail(email, 'SafeXchange — Password reset', `Your reset OTP is: ${otp}`);
}

export async function resetPassword(email: string, otp: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw Object.assign(new Error('Invalid request'), { status: 400 });

  const record = await prisma.emailOtp.findFirst({
    where: {
      userId: user.id,
      purpose: 'RESET_PASSWORD',
      code: otp,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw Object.assign(new Error('Invalid or expired OTP'), { status: 400 });

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await prisma.$transaction([
    prisma.emailOtp.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
}

export async function listSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    select: { id: true, deviceInfo: true, ipAddress: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeSession(userId: string, sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId, userId } });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return publicUser(user);
}
