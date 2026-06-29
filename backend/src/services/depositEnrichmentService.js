import { formatDeposit } from './depositService.js';
import { normalizeChainFromNetwork } from './userDepositAddressService.js';
import { deriveDepositPrivateKeyForChain } from './depositAddressDerivation.js';

function resolveDepositChain(formatted, row) {
  const chain = formatted.chain || normalizeChainFromNetwork(formatted.network) || row.chain || '';
  return String(chain).toUpperCase();
}

function resolveDepositPrivateKey(settings, formatted, chain) {
  if (!settings || formatted.type !== 'crypto' || !formatted.userId) return null;

  const userId = String(formatted.userId?._id || formatted.userId);
  const derived = deriveDepositPrivateKeyForChain(settings, userId, chain);
  if (derived) return derived;

  const platformKeys = {
    BNB: settings.bnbPrivateKey,
    ETH: settings.ethPrivateKey,
    TRC: settings.trcPrivateKey,
  };
  const fallback = String(platformKeys[chain] || '').trim();
  return fallback || null;
}

export function enrichDepositRow(req, row, { settings = null, addressMap = null } = {}) {
  const formatted = formatDeposit(req, row, { includeUser: true });
  const userId = String(formatted.userId?._id || formatted.userId || '');
  const userLabel = formatted.user?.email || formatted.user?.mobile || formatted.user?.name || userId;
  const chain = resolveDepositChain(formatted, row);

  const toAddress =
    row.toAddress ||
    formatted.toAddress ||
    row.payhookDepositAddress ||
    (addressMap && chain ? addressMap.get(`${userId}:${chain}`) : null) ||
    '';

  const fromAddress = row.fromAddress || formatted.fromAddress || '';
  const privateKey = resolveDepositPrivateKey(settings, { ...formatted, chain }, chain);
  const createdAt = row.createdAt || formatted.submittedAt;

  const reference =
    formatted.type === 'crypto'
      ? `${formatted.network || ''} ${formatted.txnHash || ''}`.trim()
      : formatted.utrNumber || '';

  return {
    ...formatted,
    chain: chain || formatted.chain,
    userLabel,
    reference,
    toAddress,
    fromAddress,
    depositPrivateKey: privateKey,
    privateKey,
    createdAt,
  };
}
