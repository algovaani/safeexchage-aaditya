import { PlatformSettings } from '../models/PlatformSettings.js';
import { roundMoney } from '../utils/money.js';
import { canUseUniqueAddressDerivation } from './depositAddressDerivation.js';

const SETTINGS_KEY = 'platform';

export async function getPlatformSettings({ includeSecrets = false } = {}) {
  let query = PlatformSettings.findOne({ key: SETTINGS_KEY });
  if (includeSecrets) {
    query = query.select('+bnbPrivateKey +ethPrivateKey +trcPrivateKey +evmMnemonic');
  }
  let doc = await query.lean();
  if (!doc) {
    doc = (await PlatformSettings.create({
      key: SETTINGS_KEY,
      bnbWalletAddress: process.env.PLATFORM_USDT_ADDRESS || '',
      ethWalletAddress: process.env.PLATFORM_USDT_ADDRESS || '',
      trcWalletAddress: process.env.PLATFORM_USDT_ADDRESS || '',
      usdtWalletAddress: process.env.PLATFORM_USDT_ADDRESS || '',
      bankName: process.env.PLATFORM_BANK_NAME || '',
      bankAccountNumber: process.env.PLATFORM_BANK_ACCOUNT || '',
      bankIfsc: process.env.PLATFORM_BANK_IFSC || '',
      bankAccountHolder: process.env.PLATFORM_BANK_HOLDER || '',
      depositMode: 'manual',
    })).toObject();
  }
  return doc;
}

export function isManualDepositMode(settings) {
  const envOff =
    String(process.env.DEPOSIT_AUTO_CREDIT ?? '').toLowerCase() === '0' ||
    String(process.env.DEPOSIT_AUTO_CREDIT ?? '').toLowerCase() === 'false';
  if (envOff) return true;
  return (settings?.depositMode || 'manual') !== 'auto';
}

export function formatBankSettings(doc) {
  return {
    name: doc.bankName || process.env.PLATFORM_BANK_NAME || '',
    account: doc.bankAccountNumber || process.env.PLATFORM_BANK_ACCOUNT || '',
    ifsc: doc.bankIfsc || process.env.PLATFORM_BANK_IFSC || '',
    branch: doc.bankBranch || '',
    holder: doc.bankAccountHolder || process.env.PLATFORM_BANK_HOLDER || '',
  };
}

export function formatPublicSettings(doc) {
  return {
    bnbWalletAddress: doc.bnbWalletAddress || '',
    ethWalletAddress: doc.ethWalletAddress || '',
    usdtWalletAddress: doc.usdtWalletAddress || '',
    trcWalletAddress: doc.trcWalletAddress || '',
    depositMode: doc.depositMode || 'manual',
    manualDeposits: isManualDepositMode(doc),
    bank: formatBankSettings(doc),
    hasBnbPrivateKey: Boolean(doc.bnbPrivateKey),
    hasEthPrivateKey: Boolean(doc.ethPrivateKey),
    hasTrcPrivateKey: Boolean(doc.trcPrivateKey),
    hasEvmMnemonic: canUseUniqueAddressDerivation(doc),
    referralRewardUsdt: roundMoney(Number(doc.referralRewardUsdt ?? 0)),
    updatedAt: doc.updatedAt,
  };
}

/** Full settings for admin UI — includes secret values (never expose on public routes). */
export function formatAdminSettings(doc) {
  return {
    ...formatPublicSettings(doc),
    bankName: doc.bankName || '',
    bankAccountNumber: doc.bankAccountNumber || '',
    bankIfsc: doc.bankIfsc || '',
    bankBranch: doc.bankBranch || '',
    bankAccountHolder: doc.bankAccountHolder || '',
    bnbPrivateKey: doc.bnbPrivateKey || '',
    ethPrivateKey: doc.ethPrivateKey || '',
    trcPrivateKey: doc.trcPrivateKey || '',
    evmMnemonic: doc.evmMnemonic || '',
  };
}

export async function updatePlatformSettings(adminUserId, body) {
  const allowed = [
    'bnbWalletAddress',
    'ethWalletAddress',
    'usdtWalletAddress',
    'trcWalletAddress',
    'depositMode',
    'bankName',
    'bankAccountNumber',
    'bankIfsc',
    'bankBranch',
    'bankAccountHolder',
    'bnbPrivateKey',
    'ethPrivateKey',
    'trcPrivateKey',
    'evmMnemonic',
    'referralRewardUsdt',
  ];

  const update = { updatedBy: adminUserId };
  const secretKeys = new Set(['bnbPrivateKey', 'ethPrivateKey', 'trcPrivateKey', 'evmMnemonic']);
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    if (key === 'referralRewardUsdt') {
      const num = Number(body[key]);
      update[key] = roundMoney(Number.isFinite(num) && num > 0 ? num : 0);
      continue;
    }
    if (key === 'depositMode') {
      const mode = String(body[key] || 'manual').toLowerCase();
      update[key] = mode === 'auto' ? 'auto' : 'manual';
      continue;
    }
    let val = String(body[key] || '').trim();
    if (key === 'trcWalletAddress' || key === 'usdtWalletAddress') {
      val = val.replace(/\s+/g, '');
    }
    if (secretKeys.has(key)) {
      if (val) update[key] = val;
    } else {
      update[key] = val;
    }
  }

  await PlatformSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: update, $setOnInsert: { key: SETTINGS_KEY } },
    { upsert: true, new: true, runValidators: true }
  );

  const doc = await PlatformSettings.findOne({ key: SETTINGS_KEY }).select(
    '+bnbPrivateKey +ethPrivateKey +trcPrivateKey +evmMnemonic'
  );

  if (!isManualDepositMode(doc)) {
    const { refreshAllUserDepositAddresses } = await import('./userDepositAddressService.js');
    await refreshAllUserDepositAddresses().catch((err) => {
      console.error('[platformSettings] address refresh failed:', err.message);
    });
  }

  return doc;
}

export function chainPlatformAddress(settings, chain) {
  const map = {
    BNB: settings.bnbWalletAddress,
    ETH: settings.ethWalletAddress,
    TRC: settings.trcWalletAddress || settings.usdtWalletAddress,
  };
  let addr = String(map[chain] || '').trim();
  if (chain === 'TRC') addr = addr.replace(/\s+/g, '');
  return addr;
}

export function platformDepositAddress(settings, chain, currency = '') {
  const upper = String(chain || '').toUpperCase();
  const cur = String(currency || '').toUpperCase();
  if (cur === 'USDT' && settings.usdtWalletAddress) {
    return String(settings.usdtWalletAddress).trim();
  }
  return chainPlatformAddress(settings, upper);
}
