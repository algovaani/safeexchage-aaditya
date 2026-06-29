import Moralis from 'moralis';
import { ethers } from 'ethers';
import { BSC_USDT_CONTRACTS, USDT_CONTRACTS, dedupeIncoming } from './chainWatcherConstants.js';

const MORALIS_CHAINS = { BNB: '0x38', ETH: '0x1' };

let moralisReady = false;
let moralisStartPromise = null;

function resetMoralisStart() {
  moralisReady = false;
  moralisStartPromise = null;
}

export function isMoralisEnabled() {
  return Boolean(process.env.MORALIS_API_KEY?.trim());
}

export function isMoralisQuotaError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('unauthorized') ||
    msg.includes('usage has been consumed') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('c0006')
  );
}

function nextUtcMidnightMs() {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

let moralisQuotaBlockedUntil = 0;

export function isMoralisTemporarilyBlocked() {
  return Date.now() < moralisQuotaBlockedUntil;
}

export function markMoralisQuotaExceeded() {
  moralisQuotaBlockedUntil = nextUtcMidnightMs();
}

export async function ensureMoralis() {
  if (moralisReady) return;
  if (!moralisStartPromise) {
    const apiKey = process.env.MORALIS_API_KEY?.trim();
    if (!apiKey) {
      throw Object.assign(new Error('MORALIS_API_KEY is not configured'), { status: 503 });
    }
    moralisStartPromise = Moralis.start({ apiKey })
      .then(() => {
        moralisReady = true;
      })
      .catch((err) => {
        resetMoralisStart();
        throw err;
      });
  }
  await moralisStartPromise;
}

export function mapMoralisChainId(chainId) {
  const id = String(chainId || '').toLowerCase();
  if (id === '0x38' || id === '56') return 'BNB';
  if (id === '0x1' || id === '1') return 'ETH';
  return null;
}

function moralisChainFor(chain) {
  return MORALIS_CHAINS[String(chain || '').toUpperCase()] || null;
}

function pickList(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.result)) return raw.result;
  return [];
}

function parseTokenAmount(tx) {
  if (tx.value_decimal != null && tx.value_decimal !== '') {
    const decimal = Number(tx.value_decimal);
    if (Number.isFinite(decimal) && decimal > 0) return decimal;
  }
  const decimals = Number(tx.token_decimals ?? tx.decimals ?? tx.tokenDecimals ?? 18);
  const rawValue = tx.value;
  if (typeof rawValue === 'string' && rawValue.includes('.')) {
    const n = Number(rawValue);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const n = Number(rawValue || 0) / 10 ** decimals;
  return Number.isFinite(n) ? n : 0;
}

function isUsdtTransfer(tx, chain) {
  if (tx.possible_spam) return false;
  const symbol = String(tx.token_symbol || tx.symbol || '').toUpperCase();
  if (symbol === 'USDT' || symbol === 'BSC-USD') return true;
  const contract = String(tx.address || tx.token_address || tx.contract || '').toLowerCase();
  if (chain === 'BNB' && BSC_USDT_CONTRACTS.has(contract)) return true;
  const usdt = USDT_CONTRACTS[chain]?.toLowerCase();
  return Boolean(usdt && contract && contract === usdt);
}

function incomingTokenRows(transfers, address, chain) {
  const addr = address.toLowerCase();
  const rows = [];

  for (const tx of transfers) {
    const to = String(tx.to_address || tx.toAddress || tx.to || '').toLowerCase();
    if (to !== addr) continue;
    if (!isUsdtTransfer(tx, chain)) continue;

    const hash = tx.transaction_hash || tx.transactionHash || tx.hash;
    if (!hash) continue;

    const amount = parseTokenAmount(tx);
    if (!(amount > 0)) continue;

    rows.push({
      hash,
      amount,
      currency: 'USDT',
      blockTime: tx.block_timestamp || tx.blockTimestamp || null,
      fromAddress: tx.from_address || tx.fromAddress || tx.from || null,
    });
  }

  return rows;
}

function parseNativeAmount(tx) {
  if (tx.value_decimal != null && tx.value_decimal !== '') {
    const decimal = Number(tx.value_decimal);
    if (Number.isFinite(decimal) && decimal > 0) return decimal;
  }
  const value = Number(tx.value || 0);
  if (!(value > 0)) return 0;
  return value / 1e18;
}

function incomingNativeRows(transactions, address, chain) {
  const addr = address.toLowerCase();
  const currency = chain === 'BNB' ? 'BNB' : 'ETH';
  const rows = [];

  for (const tx of transactions) {
    const to = String(tx.to_address || tx.toAddress || tx.to || '').toLowerCase();
    if (to !== addr) continue;

    const hash = tx.hash || tx.transaction_hash || tx.transactionHash;
    if (!hash) continue;

    const amount = parseNativeAmount(tx);
    if (!(amount > 0)) continue;

    rows.push({
      hash,
      amount,
      currency,
      blockTime: tx.block_timestamp || tx.blockTimestamp || null,
      fromAddress: tx.from_address || tx.fromAddress || tx.from || null,
    });
  }

  return rows;
}

export async function fetchEvmIncomingViaMoralis(chain, address, { includeNative = true } = {}) {
  await ensureMoralis();
  const moralisChain = moralisChainFor(chain);
  if (!moralisChain) return [];

  const rows = [];

  const tokenResp = await Moralis.EvmApi.token.getWalletTokenTransfers({
    chain: moralisChain,
    address,
    limit: 25,
  });
  rows.push(...incomingTokenRows(pickList(tokenResp.raw), address, chain));

  if (includeNative) {
    const txResp = await Moralis.EvmApi.transaction.getWalletTransactions({
      chain: moralisChain,
      address,
      limit: 25,
    });
    rows.push(...incomingNativeRows(pickList(txResp.raw), address, chain));
  }

  return dedupeIncoming(rows).slice(0, 30);
}

export function verifyMoralisWebhookSignature(body, signatureHeader) {
  const secret = process.env.MORALIS_WEBHOOK_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== 'production';

  const signature = String(signatureHeader || '').trim();
  if (!signature || !body) return false;

  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const expected = ethers.keccak256(ethers.toUtf8Bytes(payload + secret));
  return signature.toLowerCase() === expected.toLowerCase();
}

export function parseMoralisWebhookTransfers(body) {
  const chain = mapMoralisChainId(body?.chainId);
  if (!chain) return [];

  const out = [];
  const erc20 = pickList(body?.erc20Transfers);
  for (const tx of erc20) {
    const address = tx.to || tx.toAddress || tx.to_address;
    const hash = tx.transactionHash || tx.transaction_hash || tx.hash;
    if (!address || !hash) continue;
    const decimals = Number(tx.tokenDecimals ?? tx.decimals ?? 6);
    const amount = Number(tx.value || 0) / 10 ** decimals;
    if (!(amount > 0)) continue;
    out.push({
      chain,
      address: String(address),
      hash,
      amount,
      currency: 'USDT',
      fromAddress: tx.from || tx.fromAddress || tx.from_address || '',
    });
  }

  const txs = pickList(body?.txs);
  const nativeCurrency = chain === 'BNB' ? 'BNB' : 'ETH';
  for (const tx of txs) {
    const address = tx.toAddress || tx.to_address || tx.to;
    const hash = tx.hash || tx.transactionHash;
    if (!address || !hash) continue;
    const value = Number(tx.value || 0);
    if (!(value > 0)) continue;
    out.push({
      chain,
      address: String(address),
      hash,
      amount: value / 1e18,
      currency: nativeCurrency,
      fromAddress: tx.fromAddress || tx.from_address || tx.from || '',
    });
  }

  return out;
}
