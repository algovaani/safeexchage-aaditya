import { TatumSDK, Network } from '@tatumio/tatum';
import {
  BSC_USDT_CONTRACTS,
  USDT_CONTRACTS,
  dedupeIncoming,
} from './chainWatcherConstants.js';

const USDT_DECIMALS = { BNB: 18, ETH: 6 };

const TATUM_NETWORKS = {
  BNB: Network.BINANCE_SMART_CHAIN,
  ETH: Network.ETHEREUM,
};

const clients = new Map();

export function isTatumEnabled() {
  return Boolean(getTatumApiKey());
}

export function getTatumApiKey() {
  const mainnet = process.env.TATUM_MAINNET_API_KEY?.trim();
  const generic = process.env.TATUM_API_KEY?.trim();
  const testnet = process.env.TATUM_TESTNET_API_KEY?.trim();
  if (process.env.NODE_ENV === 'production') {
    return mainnet || generic || '';
  }
  return mainnet || generic || testnet || '';
}

export function isTatumQuotaError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthorized') ||
    msg.includes('quota') ||
    msg.includes('credit') ||
    msg.includes('rate limit') ||
    msg.includes('limit exceeded')
  );
}

async function getTatumClient(chain) {
  const upper = String(chain || '').toUpperCase();
  const network = TATUM_NETWORKS[upper];
  if (!network) {
    throw Object.assign(new Error(`Tatum does not support chain ${chain}`), { status: 400 });
  }

  if (clients.has(network)) return clients.get(network);

  const apiKey = getTatumApiKey();
  if (!apiKey) {
    throw Object.assign(new Error('TATUM_MAINNET_API_KEY is not configured'), { status: 503 });
  }

  const tatum = await TatumSDK.init({ network, apiKey, quiet: true });
  clients.set(network, tatum);
  return tatum;
}

function isUsdtTatumTransfer(tx, chain) {
  if (tx.transactionType !== 'fungible') return false;
  const contract = String(tx.tokenAddress || '').toLowerCase();
  if (chain === 'BNB' && BSC_USDT_CONTRACTS.has(contract)) return true;
  const usdt = USDT_CONTRACTS[chain]?.toLowerCase();
  return Boolean(usdt && contract === usdt);
}

function usdtDecimalsForContract(chain, tokenAddress) {
  const contract = String(tokenAddress || '').toLowerCase();
  if (contract === USDT_CONTRACTS.ETH?.toLowerCase()) return 6;
  if (contract === USDT_CONTRACTS.BNB?.toLowerCase()) return 18;
  return USDT_DECIMALS[chain] || 6;
}

/**
 * Tatum returns token amounts either as smallest-unit integers ("100000000")
 * or human-readable decimals ("1.02") depending on API version/endpoint.
 */
function parseTatumAmount(rawValue, decimals) {
  const amountStr = String(rawValue ?? '').trim();
  if (!amountStr) return 0;

  if (amountStr.includes('.')) {
    const human = Number(amountStr);
    return Number.isFinite(human) && human > 0 ? human : 0;
  }

  const raw = Number(amountStr);
  if (!Number.isFinite(raw) || !(raw > 0)) return 0;

  const scaled = raw / 10 ** decimals;
  const minRawForScaled = 10 ** Math.max(decimals - 2, 0);
  if (raw >= minRawForScaled) return scaled;

  return raw;
}

function parseTatumFungibleAmount(tx, chain) {
  const decimals = usdtDecimalsForContract(chain, tx.tokenAddress);
  return parseTatumAmount(tx.amount, decimals);
}

function parseTatumNativeAmount(tx) {
  return parseTatumAmount(tx.amount, 18);
}

function incomingFungibleRows(transfers, address, chain) {
  const addr = address.toLowerCase();
  const rows = [];

  for (const tx of transfers) {
    if (String(tx.address || '').toLowerCase() !== addr) continue;
    if (tx.transactionSubtype && tx.transactionSubtype !== 'incoming') continue;
    if (!isUsdtTatumTransfer(tx, chain)) continue;

    const amount = parseTatumFungibleAmount(tx, chain);
    if (!(amount > 0)) continue;

    rows.push({
      hash: tx.hash,
      amount,
      currency: 'USDT',
      blockTime: tx.timestamp || null,
      fromAddress: tx.counterAddress || null,
    });
  }

  return rows;
}

function incomingNativeRows(transactions, address, chain) {
  const addr = address.toLowerCase();
  const currency = chain === 'BNB' ? 'BNB' : 'ETH';
  const rows = [];

  for (const tx of transactions) {
    if (String(tx.address || '').toLowerCase() !== addr) continue;
    if (tx.transactionSubtype && tx.transactionSubtype !== 'incoming') continue;
    if (tx.transactionType !== 'native') continue;

    const amount = parseTatumNativeAmount(tx);
    if (!(amount > 0)) continue;

    rows.push({
      hash: tx.hash,
      amount,
      currency,
      blockTime: tx.timestamp || null,
      fromAddress: tx.counterAddress || null,
    });
  }

  return rows;
}

function unwrapTatumData(response) {
  if (response?.status === 'ERROR' || response?.error) {
    const msg = response?.error?.message || response?.error || 'Tatum API error';
    throw new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
  }
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response)) return response;
  return [];
}

export async function fetchEvmIncomingViaTatum(chain, address, { includeNative = true } = {}) {
  const upper = String(chain || '').toUpperCase();
  const tatum = await getTatumClient(upper);
  const rows = [];
  const pageSize = 25;

  const usdtContract = USDT_CONTRACTS[upper];
  const fungibleResp = await tatum.address.getTransactions({
    address,
    transactionDirection: 'incoming',
    transactionTypes: ['fungible'],
    tokenAddress: usdtContract,
    pageSize,
    page: 0,
  });
  rows.push(...incomingFungibleRows(unwrapTatumData(fungibleResp), address, upper));

  if (includeNative) {
    const nativeResp = await tatum.address.getTransactions({
      address,
      transactionDirection: 'incoming',
      transactionTypes: ['native'],
      pageSize,
      page: 0,
    });
    rows.push(...incomingNativeRows(unwrapTatumData(nativeResp), address, upper));
  }

  return dedupeIncoming(rows).slice(0, 30);
}
