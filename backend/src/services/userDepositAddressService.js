import { UserDepositAddress } from '../models/UserDepositAddress.js';
import { deriveDepositAddressForChain } from './depositAddressDerivation.js';
import {
  chainPlatformAddress,
  getPlatformSettings,
} from './platformSettingsService.js';

const CHAIN_META = {
  BNB: { network: 'BEP20', currency: 'BNB', apiNetwork: 'BSC' },
  ETH: { network: 'ERC20', currency: 'ETH', apiNetwork: 'ETH' },
  TRC: { network: 'TRC20', currency: 'USDT', apiNetwork: 'TRX' },
};

async function resolveAddressForChain(settings, userId, chain) {
  const derived = deriveDepositAddressForChain(settings, userId, chain);
  if (derived) return derived;
  return chainPlatformAddress(settings, chain);
}

async function syncStoredAddress(userId, chain, settings, existing) {
  const resolved = await resolveAddressForChain(settings, userId, chain);
  if (!resolved) return existing;

  const stored =
    chain === 'TRC'
      ? String(existing?.address || '').replace(/\s+/g, '')
      : String(existing?.address || '').trim().toLowerCase();
  const resolvedNorm =
    chain === 'TRC' ? resolved : String(resolved).trim().toLowerCase();

  if (!existing?.address || stored !== resolvedNorm) {
    return UserDepositAddress.findOneAndUpdate(
      { userId, chain },
      {
        $set: {
          address: resolved,
          network: CHAIN_META[chain].network,
          currency: CHAIN_META[chain].currency,
        },
      },
      { new: true }
    ).lean();
  }

  return existing;
}

/** Refresh cached addresses after admin updates settings (wallet / mnemonic). */
export async function refreshAllUserDepositAddresses() {
  const settings = await getPlatformSettings({ includeSecrets: true });
  const rows = await UserDepositAddress.find({}).lean();
  let updated = 0;
  for (const row of rows) {
    const synced = await syncStoredAddress(row.userId, row.chain, settings, row);
    if (synced?.address !== row.address) updated += 1;
  }
  return updated;
}

export async function getOrCreateUserDepositAddress(userId, chain, { activateWatch = false } = {}) {
  const upper = String(chain || '').toUpperCase();
  if (!CHAIN_META[upper]) {
    throw Object.assign(new Error(`Unsupported chain: ${chain}`), { status: 400 });
  }

  let row = await UserDepositAddress.findOne({ userId, chain: upper }).lean();
  const settings = await getPlatformSettings({ includeSecrets: true });

  if (row?.address) {
    row = await syncStoredAddress(userId, upper, settings, row);
    if (activateWatch) {
      row = await UserDepositAddress.findOneAndUpdate(
        { userId, chain: upper },
        { $set: { watchActiveFrom: new Date() } },
        { new: true }
      ).lean();
    }
    return { ...row, ...CHAIN_META[upper], chain: upper };
  }

  const address = await resolveAddressForChain(settings, userId, upper);
  if (!address) {
    throw Object.assign(
      new Error(`No ${upper} deposit address configured. Ask admin to set wallet addresses in Settings.`),
      { status: 503 }
    );
  }

  row = await UserDepositAddress.findOneAndUpdate(
    { userId, chain: upper },
    {
      $set: {
        address,
        network: CHAIN_META[upper].network,
        currency: CHAIN_META[upper].currency,
        watchActiveFrom: activateWatch ? new Date() : null,
      },
    },
    { upsert: true, new: true }
  ).lean();

  return { ...row, ...CHAIN_META[upper], chain: upper };
}

export async function getAllUserDepositAddresses(userId, { activateWatch = false } = {}) {
  const chains = ['BNB', 'ETH', 'TRC'];
  const rows = await Promise.all(
    chains.map((c) => getOrCreateUserDepositAddress(userId, c, { activateWatch }))
  );
  return rows;
}

export function normalizeChainFromNetwork(network) {
  const n = String(network || '').toUpperCase();
  if (n.includes('BEP') || n === 'BSC' || n === 'BNB') return 'BNB';
  if (n.includes('ERC') || n === 'ETH') return 'ETH';
  if (n.includes('TRC') || n === 'TRX' || n === 'TRON') return 'TRC';
  return null;
}
