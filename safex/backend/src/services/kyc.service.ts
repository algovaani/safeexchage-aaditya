import { DocType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { uploadBuffer } from '../lib/cloudinary.js';

export async function submitKyc(
  userId: string,
  documentType: DocType,
  files: {
    documentFront?: Express.Multer.File;
    documentBack?: Express.Multer.File;
    selfie?: Express.Multer.File;
    addressProof?: Express.Multer.File;
  }
) {
  const uploads: Record<string, string> = {};
  const map: [keyof typeof files, string][] = [
    ['documentFront', 'front'],
    ['documentBack', 'back'],
    ['selfie', 'selfie'],
    ['addressProof', 'address'],
  ];

  for (const [field, name] of map) {
    const f = files[field];
    if (f) {
      uploads[field] = await uploadBuffer(f.buffer, `kyc/${userId}`, name, f.mimetype);
    }
  }

  return prisma.kYC.upsert({
    where: { userId },
    create: {
      userId,
      status: 'PENDING',
      documentType,
      submittedAt: new Date(),
      ...uploads,
    },
    update: {
      status: 'PENDING',
      documentType,
      rejectionReason: null,
      submittedAt: new Date(),
      ...uploads,
    },
  });
}

export async function getKycStatus(userId: string) {
  const kyc = await prisma.kYC.findUnique({ where: { userId } });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true, mobile: true },
  });
  return { user, kyc: kyc || { status: 'NOT_SUBMITTED' } };
}

export async function listKycAdmin(status?: string, page = 1, limit = 20) {
  const where = status && status !== 'ALL' ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' } : {};
  const [items, total] = await Promise.all([
    prisma.kYC.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, mobile: true } } },
      orderBy: { submittedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.kYC.count({ where }),
  ]);
  return { items, total, page, limit };
}

export async function getKycById(id: string) {
  return prisma.kYC.findUniqueOrThrow({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true, mobile: true, createdAt: true } } },
  });
}

export async function approveKyc(id: string, adminId: string) {
  return prisma.kYC.update({
    where: { id },
    data: { status: 'APPROVED', reviewedBy: adminId, reviewedAt: new Date() },
  });
}

export async function rejectKyc(id: string, adminId: string, reason: string) {
  return prisma.kYC.update({
    where: { id },
    data: { status: 'REJECTED', rejectionReason: reason, reviewedBy: adminId, reviewedAt: new Date() },
  });
}
