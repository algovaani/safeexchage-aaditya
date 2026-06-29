import { ethers } from 'ethers';
import { Deposit } from '../models/Deposit.js';
import { UserDepositAddress } from '../models/UserDepositAddress.js';
import { getPlatformSettings } from './platformSettingsService.js';
import { deriveDepositPrivateKeyForChain } from './depositAddressDerivation.js';
import { enrichDepositRow } from './depositEnrichmentService.js';
import { USDT_CONTRACTS } from './chainWatcherConstants.js';
import {
  canTreasuryWithdraw,
  createTreasuryWithdrawalFromDeposit,
  defaultAdminWalletAddress,
} from './treasuryService.js';
import { normalizeChainFromNetwork } from './userDepositAddressService.js';
import { roundMoney } from '../utils/money.js';

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

/** Native coin sent to user address when gas is too low for USDT transfer */
const GAS_TOP_UP = {
  BNB: process.env.TREASURY_GAS_TOPUP_BNB || '0.0006',
  ETH: process.env.TREASURY_GAS_TOPUP_ETH || '0.0015',
};

const MIN_NATIVE_WEI = {
  BNB: ethers.parseEther(process.env.TREASURY_MIN_NATIVE_BNB || '0.00015'),
  ETH: ethers.parseEther(process.env.TREASURY_MIN_NATIVE_ETH || '0.00008'),
};

function resolveChain(deposit) {
  return String(deposit.chain || normalizeChainFromNetwork(deposit.network) || '').toUpperCase();
}

function rpcList(chain) {
  const raw =
    chain === 'BNB'
      ? process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org,https://bsc-dataseed2.binance.org'
      : process.env.ETH_RPC_URL || 'https://eth.drpc.org,https://1rpc.io/eth';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

async function getProvider(chain) {
  let lastErr;
  for (const url of rpcList(chain)) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      await provider.getBlockNumber();
      return provider;
    } catch (err) {
      lastErr = err;
    }
  }
  throw Object.assign(new Error(`RPC unavailable for ${chain}: ${lastErr?.message || 'unknown'}`), {
    status: 503,
  });
}

async function resolveUserDepositAddress(deposit) {
  const chain = resolveChain(deposit);
  if (deposit.toAddress) return deposit.toAddress;
  const row = await UserDepositAddress.findOne({ userId: deposit.userId, chain }).lean();
  return row?.address || '';
}

async function resolveDepositPrivateKey(deposit, settings) {
  const chain = resolveChain(deposit);
  const userId = String(deposit.userId);
  const key = deriveDepositPrivateKeyForChain(settings, userId, chain);
  if (!key) {
    throw Object.assign(new Error(`No private key configured for ${chain} sweep`), { status: 503 });
  }
  return key;
}

function adminGasWallet(settings, chain) {
  if (chain === 'BNB') {
    return {
      address: settings.bnbWalletAddress || defaultAdminWalletAddress(),
      privateKey: settings.bnbPrivateKey || process.env.TREASURY_GAS_PRIVATE_KEY || '',
    };
  }
  if (chain === 'ETH') {
    return {
      address: settings.ethWalletAddress || defaultAdminWalletAddress(),
      privateKey: settings.ethPrivateKey || process.env.TREASURY_GAS_PRIVATE_KEY || '',
    };
  }
  return { address: '', privateKey: '' };
}

async function readBalances(provider, chain, address) {
  const usdtContract = USDT_CONTRACTS[chain];
  if (!usdtContract) {
    throw Object.assign(new Error(`USDT contract not configured for ${chain}`), { status: 400 });
  }

  const token = new ethers.Contract(usdtContract, ERC20_ABI, provider);
  const [nativeWei, tokenRaw, tokenDecimals] = await Promise.all([
    provider.getBalance(address),
    token.balanceOf(address),
    token.decimals().catch(() => (chain === 'BNB' ? 18 : 6)),
  ]);

  const native = Number(ethers.formatEther(nativeWei));
  const usdt = Number(ethers.formatUnits(tokenRaw, tokenDecimals));

  return {
    native,
    nativeSymbol: chain === 'BNB' ? 'BNB' : 'ETH',
    usdt: roundMoney(usdt),
    usdtRawWei: tokenRaw.toString(),
    tokenDecimals: Number(tokenDecimals),
    usdtContract,
    /** @type {bigint} internal only — do not send in JSON responses */
    usdtRaw: tokenRaw,
  };
}

function balancesForApi(balances) {
  if (!balances) return balances;
  const { usdtRaw, ...safe } = balances;
  return safe;
}

export async function buildSweepPreview(deposit, req = null) {
  const chain = resolveChain(deposit);
  if (!['BNB', 'ETH'].includes(chain)) {
    return {
      chain,
      supported: false,
      message: 'Auto-sweep is only available for BNB and ETH. Use manual treasury record for TRC.',
      steps: [
        'Open TronLink or wallet with user deposit private key',
        'Send USDT (TRC20) to your admin TRON address',
        'Record outbound TX hash in Treasury → Manual withdraw',
      ],
    };
  }

  const settings = await getPlatformSettings({ includeSecrets: true });
  const fromAddress = await resolveUserDepositAddress(deposit);
  if (!fromAddress) {
    throw Object.assign(new Error('User deposit address not found'), { status: 404 });
  }

  const adminWallet = defaultAdminWalletAddress() || settings.bnbWalletAddress || settings.ethWalletAddress;
  const gasWallet = adminGasWallet(settings, chain);
  const provider = await getProvider(chain);
  const balances = await readBalances(provider, chain, fromAddress);
  const minNative = Number(ethers.formatEther(MIN_NATIVE_WEI[chain]));
  const gasTopUp = GAS_TOP_UP[chain];
  const needsGas = balances.native < minNative;

  const steps = [
    {
      step: 1,
      title: 'Check user deposit wallet',
      detail: `From: ${fromAddress}`,
      status: 'ready',
    },
    {
      step: 2,
      title: 'Check balances',
      detail: `${balances.usdt} USDT · ${balances.native} ${balances.nativeSymbol} (gas)`,
      status: balances.usdt > 0 ? 'ready' : 'warning',
    },
    {
      step: 3,
      title: needsGas ? 'Fund gas from admin hot wallet' : 'Gas sufficient',
      detail: needsGas
        ? `Send ~${gasTopUp} ${balances.nativeSymbol} from ${gasWallet.address || 'admin wallet'} → user address`
        : `User wallet already has ${balances.nativeSymbol} for transfer fee`,
      status: needsGas ? (gasWallet.privateKey ? 'action' : 'blocked') : 'skip',
    },
    {
      step: 4,
      title: 'Transfer USDT to admin',
      detail: `Send ${balances.usdt} USDT → ${adminWallet || '(set admin wallet in settings)'}`,
      status: balances.usdt > 0 && adminWallet ? 'action' : 'blocked',
    },
    {
      step: 5,
      title: 'Record sweep in admin panel',
      detail: 'Deposit marked swept; appears in Treasury history',
      status: 'pending',
    },
  ];

  const enriched = req
    ? enrichDepositRow(req, deposit.toObject ? deposit.toObject() : deposit, {
        settings,
        addressMap: new Map([[`${deposit.userId}:${chain}`, fromAddress]]),
      })
    : null;

  return {
    chain,
    supported: true,
    depositId: deposit._id,
    fromAddress,
    toAddress: adminWallet || '',
    fromAddressUserDeposit: fromAddress,
    adminWalletAddress: adminWallet || '',
    gasWalletAddress: gasWallet.address || '',
    hasGasWalletKey: Boolean(gasWallet.privateKey),
    hasDepositPrivateKey: Boolean(await resolveDepositPrivateKey(deposit, settings).catch(() => null)),
    balances: balancesForApi(balances),
    needsGas,
    gasTopUp,
    minNative,
    canAutoSweep:
      balances.usdt > 0 &&
      Boolean(adminWallet) &&
      Boolean(await resolveDepositPrivateKey(deposit, settings).catch(() => null)) &&
      (!needsGas || Boolean(gasWallet.privateKey)),
    steps,
    enriched,
  };
}

async function sendGasTopUp(provider, chain, settings, toAddress) {
  const gasWallet = adminGasWallet(settings, chain);
  if (!gasWallet.privateKey) {
    throw Object.assign(
      new Error(`Set ${chain} private key in Admin → Settings to auto-fund gas`),
      { status: 503 }
    );
  }
  if (!gasWallet.address) {
    throw Object.assign(new Error('Admin gas wallet address not configured'), { status: 503 });
  }

  const signer = new ethers.Wallet(gasWallet.privateKey, provider);
  const value = ethers.parseEther(GAS_TOP_UP[chain]);
  const tx = await signer.sendTransaction({ to: toAddress, value });
  const receipt = await tx.wait();
  return {
    hash: receipt.hash,
    amount: GAS_TOP_UP[chain],
    symbol: chain === 'BNB' ? 'BNB' : 'ETH',
    from: gasWallet.address,
    to: toAddress,
  };
}

async function transferUsdt(provider, chain, fromPrivateKey, toAddress, amountRaw) {
  const usdtContract = USDT_CONTRACTS[chain];
  const wallet = new ethers.Wallet(fromPrivateKey, provider);
  const token = new ethers.Contract(usdtContract, ERC20_ABI, wallet);
  const tx = await token.transfer(toAddress, amountRaw);
  const receipt = await tx.wait();
  const sent = Number(ethers.formatUnits(amountRaw, chain === 'BNB' ? 18 : 6));
  return {
    hash: receipt.hash,
    amount: roundMoney(sent),
    currency: 'USDT',
    from: wallet.address,
    to: toAddress,
  };
}

export async function fundGasForDeposit(depositId, adminUserId) {
  const deposit = await Deposit.findById(depositId);
  if (!deposit) throw Object.assign(new Error('Deposit not found'), { status: 404 });
  if (!canTreasuryWithdraw(deposit)) {
    throw Object.assign(new Error('Deposit is not eligible for treasury operations'), { status: 400 });
  }

  const chain = resolveChain(deposit);
  if (!['BNB', 'ETH'].includes(chain)) {
    throw Object.assign(new Error('Gas funding only supported on BNB/ETH'), { status: 400 });
  }

  const settings = await getPlatformSettings({ includeSecrets: true });
  const toAddress = await resolveUserDepositAddress(deposit);
  const provider = await getProvider(chain);
  const gasTx = await sendGasTopUp(provider, chain, settings, toAddress);

  return {
    depositId: deposit._id,
    gasTx,
    message: `Sent ${gasTx.amount} ${gasTx.symbol} for gas to user deposit address`,
  };
}

export async function executeAutoSweep(depositId, adminUserId, body = {}) {
  const deposit = await Deposit.findById(depositId);
  if (!deposit) throw Object.assign(new Error('Deposit not found'), { status: 404 });
  if (!canTreasuryWithdraw(deposit)) {
    throw Object.assign(new Error('Deposit is not available for sweep'), { status: 400 });
  }

  const chain = resolveChain(deposit);
  if (!['BNB', 'ETH'].includes(chain)) {
    throw Object.assign(new Error('Auto-sweep only supported for BNB and ETH'), { status: 400 });
  }

  const adminWalletAddress = String(
    body.admin_wallet_address || body.adminWalletAddress || defaultAdminWalletAddress()
  ).trim();
  if (!adminWalletAddress) {
    throw Object.assign(new Error('admin_wallet_address is required'), { status: 400 });
  }

  const settings = await getPlatformSettings({ includeSecrets: true });
  const fromAddress = await resolveUserDepositAddress(deposit);
  const depositPrivateKey = await resolveDepositPrivateKey(deposit, settings);
  const provider = await getProvider(chain);
  const balances = await readBalances(provider, chain, fromAddress);

  if (!(balances.usdtRaw > 0n)) {
    throw Object.assign(new Error('No USDT balance on user deposit address to sweep'), { status: 400 });
  }

  const fundGasFirst = body.fund_gas_first !== false;
  let gasTx = null;
  const minNative = MIN_NATIVE_WEI[chain];
  const currentNative = await provider.getBalance(fromAddress);

  if (fundGasFirst && currentNative < minNative) {
    gasTx = await sendGasTopUp(provider, chain, settings, fromAddress);
    await new Promise((r) => setTimeout(r, 4000));
  } else if (currentNative < minNative) {
    throw Object.assign(
      new Error(
        `Insufficient ${balances.nativeSymbol} for gas on user address. Enable "Fund gas first" or send BNB/ETH manually.`
      ),
      { status: 400 }
    );
  }

  const tokenTx = await transferUsdt(
    provider,
    chain,
    depositPrivateKey,
    adminWalletAddress,
    balances.usdtRaw
  );

  const treasuryWithdrawal = await createTreasuryWithdrawalFromDeposit(deposit, adminUserId, {
    admin_wallet_address: adminWalletAddress,
    outbound_txn_hash: tokenTx.hash,
    notes: String(body.notes || `Auto-sweep ${tokenTx.amount} USDT to admin wallet`).trim(),
    from_address: fromAddress,
    platform_address: fromAddress,
    gas_tx_hash: gasTx?.hash || '',
    sweep_mode: 'auto',
    swept_amount: tokenTx.amount,
    swept_currency: 'USDT',
  });

  return {
    depositId: deposit._id,
    fromAddress,
    adminWalletAddress,
    gasTx,
    tokenTx,
    treasuryWithdrawalId: treasuryWithdrawal._id,
    message: `Swept ${tokenTx.amount} USDT to admin wallet`,
  };
}

export async function listPendingSweepDeposits(req) {
  const rows = await Deposit.find({
    type: 'crypto',
    status: 'approved',
    treasuryStatus: 'pending_sweep',
  })
    .populate('userId', 'email mobile name')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const settings = await getPlatformSettings({ includeSecrets: true });
  const addresses = await UserDepositAddress.find({
    userId: { $in: rows.map((r) => r.userId) },
  }).lean();
  const addressMap = new Map(addresses.map((a) => [`${String(a.userId)}:${a.chain}`, a.address]));

  const previews = [];
  for (const row of rows) {
    const enriched = enrichDepositRow(req, row, { settings, addressMap });
    previews.push({
      ...enriched,
      canTreasuryWithdraw: true,
      sweepPreview: {
        chain: resolveChain(row),
        fromAddress: enriched.toAddress,
        supported: ['BNB', 'ETH'].includes(resolveChain(row)),
      },
    });
  }

  return previews;
}
