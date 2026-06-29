import axios from 'axios';
import { Deposit } from '../models/Deposit.js';
import { ProcessedChainTx } from '../models/ProcessedChainTx.js';
import { UserDepositAddress } from '../models/UserDepositAddress.js';
import { computeDepositUsdtCredit } from './depositConversionService.js';
import { creditWalletForDeposit } from './depositService.js';
import { createPendingDepositTransaction } from './transactionService.js';
import { fetchEvmIncoming, evmScannerStatus } from './evmDepositScanService.js';
import { getPlatformSettings, isManualDepositMode } from './platformSettingsService.js';
import {
  CHAIN_CURRENCY,
  CHAIN_NETWORK,
  MIN_AUTO_CREDIT,
  TRC20_USDT_CONTRACT,
  dedupeIncoming,
} from './chainWatcherConstants.js';

const DEFAULT_BSC_RPCS = ['https://bsc-dataseed1.binance.org', 'https://bsc-dataseed2.binance.org'];
const DEFAULT_ETH_RPCS = ['https://eth.drpc.org', 'https://1rpc.io/eth'];
const BSC_RPC_URLS = (process.env.BSC_RPC_URL || DEFAULT_BSC_RPCS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const ETH_RPC_URLS = (process.env.ETH_RPC_URL || DEFAULT_ETH_RPCS.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const SCAN_NATIVE =
  String(process.env.CHAIN_WATCHER_SCAN_NATIVE ?? '1').toLowerCase() === '1' ||
  String(process.env.CHAIN_WATCHER_SCAN_NATIVE ?? '').toLowerCase() === 'true';

const TRC20_USDT = TRC20_USDT_CONTRACT;
const WATCH_GRACE_MS = Number(process.env.CHAIN_WATCHER_WATCH_GRACE_MS) || 10 * 60_000;
let watcherRunning = false;

function normalizeAddressKey(chain, address) {
  const a = String(address || '').trim();
  return chain === 'TRC' ? a : a.toLowerCase();
}

async function groupUniqueDepositAddresses() {
  const rows = await UserDepositAddress.find({}).lean();
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.chain}:${normalizeAddressKey(row.chain, row.address)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function txEligibleForRow(tx, row) {
  if (!tx.blockTime) return true;
  const txAt = new Date(tx.blockTime);
  if (Number.isNaN(txAt.getTime())) return true;

  const since = row.watchActiveFrom || row.createdAt;
  if (!since) return true;

  const cutoff = new Date(since);
  cutoff.setTime(cutoff.getTime() - WATCH_GRACE_MS);
  return txAt >= cutoff;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEvmAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(address || '').trim());
}

function isTronAddress(address) {
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(address || '').trim());
}

function validateScanTarget(chain, address) {
  if (!address?.trim()) {
    return `${chain}: no deposit address to scan. Set ${chain} wallet address in Admin → Settings.`;
  }
  if (chain === 'TRC') {
    if (isEvmAddress(address)) {
      return `TRC: address "${address}" is an Ethereum/BNB-style address (0x…). Use a TRON base58 address (starts with T).`;
    }
    if (!isTronAddress(address)) {
      return `TRC: "${address}" is not a valid TRON address (expected T…, 34 chars).`;
    }
    return null;
  }
  if ((chain === 'BNB' || chain === 'ETH') && !isEvmAddress(address)) {
    return `${chain}: "${address}" is not a valid EVM address (expected 0x + 40 hex chars).`;
  }
  return null;
}

async function jsonRpcCall(rpcUrl, method, params) {
  const { data, status } = await axios.post(
    rpcUrl,
    { jsonrpc: '2.0', id: Date.now(), method, params },
    { timeout: 20_000, headers: { 'Content-Type': 'application/json' }, validateStatus: () => true }
  );
  if (status >= 400 || data?.error) {
    throw new Error(data?.error?.message || `RPC HTTP ${status}`);
  }
  return data?.result;
}

export async function verifyEvmTransactionReceipt({ chain, txHash }) {
  const rpcUrls = chain === 'BNB' ? BSC_RPC_URLS : ETH_RPC_URLS;
  for (const rpcUrl of rpcUrls) {
    try {
      const receipt = await jsonRpcCall(rpcUrl, 'eth_getTransactionReceipt', [txHash]);
      if (!receipt) continue;
      return {
        found: true,
        success: BigInt(receipt.status) === 1n,
        to: receipt.to,
      };
    } catch {
      continue;
    }
  }
  return { found: false, success: false };
}

async function fetchBnbIncoming(address) {
  return fetchEvmIncoming('BNB', address, { includeNative: SCAN_NATIVE });
}

async function fetchEthIncoming(address) {
  return fetchEvmIncoming('ETH', address, { includeNative: SCAN_NATIVE });
}

async function fetchTrcNativeIncoming(address) {
  const { data, status } = await axios.get(
    `https://api.trongrid.io/v1/accounts/${address}/transactions`,
    { params: { limit: 20, only_to: true, only_confirmed: true }, timeout: 20_000, validateStatus: () => true }
  );
  if (status >= 400) {
    throw new Error(data?.Error || data?.message || `TronGrid request failed (${status})`);
  }
  const out = [];
  for (const tx of data?.data || []) {
    const hash = tx.txID;
    const contract = tx.raw_data?.contract?.[0];
    if (!contract || contract.type !== 'TransferContract' || !hash) continue;
    const amountSun = Number(contract.parameter?.value?.amount || 0);
    if (amountSun <= 0) continue;
    out.push({ hash, amount: amountSun / 1e6, currency: 'TRX', fromAddress: contract.parameter?.value?.owner_address || null });
  }
  return out;
}

async function fetchTrc20Incoming(address) {
  const { data, status } = await axios.get(
    `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`,
    {
      params: { limit: 20, only_to: true, only_confirmed: true, contract_address: TRC20_USDT },
      timeout: 20_000,
      validateStatus: () => true,
    }
  );
  if (status >= 400) {
    throw new Error(data?.Error || data?.message || `TronGrid TRC20 request failed (${status})`);
  }
  return (data?.data || [])
    .filter((tx) => tx.to === address && tx.transaction_id)
    .map((tx) => ({
      hash: tx.transaction_id,
      amount: Number(tx.value || 0) / 10 ** Number(tx.token_info?.decimals ?? 6),
      currency: 'USDT',
      fromAddress: tx.from || null,
    }));
}

async function fetchTrcIncoming(address) {
  const [nativeTxs, trc20Txs] = await Promise.all([
    fetchTrcNativeIncoming(address).catch(() => []),
    fetchTrc20Incoming(address).catch(() => []),
  ]);
  return dedupeIncoming([...trc20Txs, ...nativeTxs]);
}

async function purgeOrphanPendingDeposits(txnHash) {
  const approved = await Deposit.findOne({ txnHash, status: 'approved' }).lean();
  if (!approved) return;
  await Deposit.deleteMany({ txnHash, status: 'pending', _id: { $ne: approved._id } });
}

async function completeStuckPendingDeposit(deposit) {
  if (deposit.status !== 'pending') return false;
  try {
    const conversion = await computeDepositUsdtCredit(deposit);
    deposit.usdtAmount = conversion.usdtAmount;
    deposit.conversionRate = conversion.conversionRate;
    await deposit.save();
    if (!deposit.transactionId) {
      await createPendingDepositTransaction(deposit);
    }
    await creditWalletForDeposit(deposit, null);
    deposit.autoVerified = true;
    await deposit.save();
    const chainKey = deposit.chain || 'BNB';
    const exists = await ProcessedChainTx.findOne({ chain: chainKey, txnHash: deposit.txnHash }).lean();
    if (!exists) {
      await ProcessedChainTx.create({
        chain: chainKey,
        txnHash: deposit.txnHash,
        depositId: deposit._id,
        userId: deposit.userId,
        amount: deposit.amount,
        currency: deposit.currency,
      });
    }
    console.info(
      `[chainWatcher] completed stuck deposit ${deposit._id} (${deposit.amount} ${deposit.currency})`
    );
    return true;
  } catch (err) {
    console.error(`[chainWatcher] stuck deposit ${deposit._id} failed: ${err.message}`);
    return false;
  }
}

export async function processIncomingChainDeposit({ chain, userId, address, tx }) {
  const settings = await getPlatformSettings();
  if (isManualDepositMode(settings)) {
    return;
  }

  if (!tx.hash || !(tx.amount > 0)) {
    return;
  }

  const currency = tx.currency || CHAIN_CURRENCY[chain];
  const min = MIN_AUTO_CREDIT[currency] ?? MIN_AUTO_CREDIT[chain] ?? 0;
  if (tx.amount < min) {
    console.info(
      `[chainWatcher] skip ${tx.hash} — ${tx.amount} ${currency} below min ${min}`
    );
    return;
  }

  await purgeOrphanPendingDeposits(tx.hash);

  const processed = await ProcessedChainTx.findOne({ chain, txnHash: tx.hash }).lean();
  if (processed) return;

  const existing = await Deposit.findOne({
    txnHash: tx.hash,
    status: { $in: ['pending', 'approved'] },
  });
  if (existing) {
    if (existing.status === 'pending') {
      await completeStuckPendingDeposit(existing);
    }
    return;
  }

  // Claim tx hash first — prevents double-credit if watcher overlaps.
  try {
    await ProcessedChainTx.create({
      chain,
      txnHash: tx.hash,
      userId,
      amount: tx.amount,
      currency,
    });
  } catch (err) {
    if (err?.code === 11000) return;
    throw err;
  }

  const deposit = await Deposit.create({
    userId,
    type: 'crypto',
    amount: tx.amount,
    currency,
    txnHash: tx.hash,
    network: CHAIN_NETWORK[chain],
    chain,
    toAddress: address || '',
    fromAddress: tx.fromAddress || '',
    status: 'pending',
    source: 'chain_watcher',
  });

  try {
    const conversion = await computeDepositUsdtCredit(deposit);
    deposit.usdtAmount = conversion.usdtAmount;
    deposit.conversionRate = conversion.conversionRate;
    await deposit.save();
    await createPendingDepositTransaction(deposit);
    await creditWalletForDeposit(deposit, null);
    deposit.autoVerified = true;
    await deposit.save();

    await ProcessedChainTx.updateOne(
      { chain, txnHash: tx.hash },
      { $set: { depositId: deposit._id } }
    );

    console.info(
      `[chainWatcher] credited ${tx.amount} ${currency} → ${conversion.usdtAmount} USDT (user ${userId}, tx ${tx.hash})`
    );
  } catch (err) {
    await Deposit.deleteOne({ _id: deposit._id });
    await ProcessedChainTx.deleteOne({ chain, txnHash: tx.hash }).catch(() => {});
    console.error(
      `[chainWatcher] ${chain} credit failed\n` +
        `  Tx: ${tx.hash}\n` +
        `  User: ${userId}\n` +
        `  Reason: ${err.message}`
    );
  }
}

async function scanAddress(row) {
  const { chain, address, userId } = row;
  const validationError = validateScanTarget(chain, address);
  if (validationError) {
    console.error(`[chainWatcher] ${chain} scan skipped\n  Reason: ${validationError}`);
    return;
  }

  let incoming = [];
  let source = 'unknown';
  try {
    if (chain === 'BNB') {
      const result = await fetchBnbIncoming(address);
      incoming = result.rows;
      source = result.source;
    } else if (chain === 'ETH') {
      const result = await fetchEthIncoming(address);
      incoming = result.rows;
      source = result.source;
    } else if (chain === 'TRC') {
      incoming = await fetchTrcIncoming(address);
      source = 'TronGrid';
    }
  } catch (err) {
    console.error(`[chainWatcher] ${chain} scan failed for ${address}\n  Reason: ${err.message}`);
    return;
  }

  if (incoming.length) {
    console.info(`[chainWatcher] ${chain} ${source}: ${incoming.length} incoming transfer(s) for ${address}`);
  }

  for (const tx of incoming) {
    if (!txEligibleForRow(tx, row)) continue;
    try {
      await processIncomingChainDeposit({ chain, userId, address, tx });
    } catch (err) {
      console.error(
        `[chainWatcher] ${chain} deposit failed for ${tx.hash || 'unknown'}\n  Reason: ${err.message}`
      );
    }
  }
}

export async function runChainDepositWatcher() {
  if (watcherRunning) return;
  watcherRunning = true;
  try {
    const scan = evmScannerStatus();
    if (scan.moralis && scan.tatum) {
      console.info('[chainWatcher] BNB/ETH via Moralis (primary) + Tatum (fallback)');
    } else if (scan.moralis) {
      console.info('[chainWatcher] BNB/ETH via Moralis API');
    } else if (scan.tatum) {
      console.info('[chainWatcher] BNB/ETH via Tatum API');
    } else {
      console.warn(
        '[chainWatcher] No MORALIS_API_KEY or TATUM_MAINNET_API_KEY — BNB/ETH deposits will not be scanned'
      );
    }

    const groups = await groupUniqueDepositAddresses();
    for (const [key, owners] of groups) {
      if (owners.length > 1) {
        console.warn(
          `[chainWatcher] ${key} shared by ${owners.length} users — auto-credit disabled. ` +
            'Set EVM mnemonic / derivation secret in Admin → Settings for unique deposit addresses per user.'
        );
        continue;
      }
      await scanAddress(owners[0]);
      await sleep(300);
    }
  } catch (err) {
    console.error(`[chainWatcher] run failed\n  Reason: ${err.message}`);
  } finally {
    watcherRunning = false;
  }
}

export function startChainDepositWatcher(intervalMs) {
  const ms = Number(intervalMs || process.env.CHAIN_WATCHER_INTERVAL_MS) || 60_000;
  runChainDepositWatcher().catch((err) => {
    console.error('[chainWatcher] initial run failed:', err.message);
  });
  return setInterval(() => {
    runChainDepositWatcher().catch((err) => {
      console.error('[chainWatcher] scheduled run failed:', err.message);
    });
  }, ms);
}
