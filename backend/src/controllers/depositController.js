import { Deposit } from '../models/Deposit.js';
import { removeFiatProof } from '../middleware/fiatDepositUpload.js';
import { computeDepositUsdtCredit } from '../services/depositConversionService.js';
import { formatDeposit, mapFiatProof } from '../services/depositService.js';
import {
  allPlatformWallets,
  buildPlatformDepositAddressRow,
  resolveDepositMode,
} from '../services/manualDepositService.js';
import {
  formatPublicSettings,
  getPlatformSettings,
} from '../services/platformSettingsService.js';
import { getAllUserDepositAddresses, getOrCreateUserDepositAddress, normalizeChainFromNetwork } from '../services/userDepositAddressService.js';
import { createPendingDepositTransaction } from '../services/transactionService.js';
import { error, success } from '../utils/response.js';

export async function platformInfo(_req, res, next) {
  try {
    const settings = await getPlatformSettings();
    const publicSettings = formatPublicSettings(settings);
    const networks = (process.env.PLATFORM_USDT_NETWORKS || 'TRC20,ERC20,BEP20')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    const wallets = allPlatformWallets(settings);

    return success(res, {
      depositMode: publicSettings.depositMode,
      manualDeposits: publicSettings.manualDeposits,
      usdt: {
        currency: 'USDT',
        address: wallets.usdt || wallets.trc || wallets.eth || wallets.bnb || '',
        networks,
      },
      wallets: {
        bnb: wallets.bnb,
        eth: wallets.eth,
        trc: wallets.trc,
        usdt: wallets.usdt,
      },
      bank: publicSettings.bank,
    }, 'Platform deposit info fetched');
  } catch (e) {
    return next(e);
  }
}

export async function getUserDepositAddresses(req, res, next) {
  try {
    const { settings, manual } = await resolveDepositMode();
    const chain = req.query.chain;
    if (manual) {
      if (chain) {
        const row = buildPlatformDepositAddressRow(settings, chain);
        return success(res, row, 'Platform deposit address fetched');
      }
      const rows = ['BNB', 'ETH', 'TRC'].map((c) => buildPlatformDepositAddressRow(settings, c));
      return success(res, { addresses: rows }, 'Platform deposit addresses fetched');
    }

    if (chain) {
      const row = await getOrCreateUserDepositAddress(req.userId, chain, { activateWatch: true });
      return success(res, row, 'Deposit address fetched');
    }
    const rows = await getAllUserDepositAddresses(req.userId, { activateWatch: true });
    return success(res, { addresses: rows }, 'Deposit addresses fetched');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function cryptoAddress(req, res, next) {
  try {
    const chain = req.query.chain || 'TRC';
    const currency = req.query.currency || '';
    const { settings, manual } = await resolveDepositMode();

    if (manual) {
      const row = buildPlatformDepositAddressRow(settings, chain, currency);
      if (!row.address) {
        return error(res, 'Admin has not configured a deposit wallet for this network yet', 503);
      }
      return success(res, row, 'Platform deposit address fetched');
    }

    const row = await getOrCreateUserDepositAddress(req.userId, chain, { activateWatch: true });
    return success(res, row, 'Deposit address fetched');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function submitCrypto(req, res, next) {
  try {
    const { amount, txn_hash, network, currency, from_address, user_wallet_address } = req.body;
    const txnHash = String(txn_hash || '').trim();
    const fromAddress = String(from_address || user_wallet_address || '').trim();

    if (!txnHash) {
      return error(res, 'Transaction hash is required', 400);
    }

    if (txnHash) {
      const duplicate = await Deposit.findOne({
        txnHash,
        status: { $in: ['pending', 'approved'] },
      });
      if (duplicate) {
        return error(res, 'This transaction hash was already submitted', 409);
      }
    }

    const networkStr = String(network).trim();
    const chain = normalizeChainFromNetwork(networkStr) || '';
    const { settings, manual } = await resolveDepositMode();
    let toAddress = '';
    if (chain) {
      if (manual) {
        toAddress = buildPlatformDepositAddressRow(settings, chain, currency).address;
      } else {
        try {
          const addrRow = await getOrCreateUserDepositAddress(req.userId, chain, { activateWatch: true });
          toAddress = addrRow?.address || '';
        } catch {
          /* optional */
        }
      }
    }

    const deposit = await Deposit.create({
      userId: req.userId,
      type: 'crypto',
      amount,
      currency: String(currency || 'USDT').toUpperCase(),
      txnHash,
      network: networkStr,
      chain,
      toAddress,
      fromAddress,
      status: 'pending',
      source: 'user',
    });

    try {
      const conversion = await computeDepositUsdtCredit(deposit);
      deposit.usdtAmount = conversion.usdtAmount;
      deposit.conversionRate = conversion.conversionRate;
      await deposit.save();
    } catch (convErr) {
      await Deposit.deleteOne({ _id: deposit._id });
      if (convErr.status) return error(res, convErr.message, convErr.status);
      throw convErr;
    }

    await createPendingDepositTransaction(deposit);

    return success(res, formatDeposit(req, deposit), 'Crypto deposit submitted — waiting for admin approval', 201);
  } catch (e) {
    return next(e);
  }
}

export async function submitFiat(req, res, next) {
  try {
    const { amount, utr_number, bank_name, account_number, branch } = req.body;

    if (!req.file) {
      return error(res, 'payment_proof file is required', 400);
    }

    const paymentProof = mapFiatProof(req.file);

    const deposit = await Deposit.create({
      userId: req.userId,
      type: 'fiat',
      amount,
      currency: 'USDT',
      usdtAmount: amount,
      conversionRate: 1,
      utrNumber: utr_number?.trim() || '',
      bankName: bank_name?.trim() || '',
      accountNumber: account_number?.trim() || '',
      network: branch?.trim() ? `Branch: ${branch.trim()}` : '',
      paymentProof,
      status: 'pending',
      source: 'user',
    });

    await createPendingDepositTransaction(deposit);

    return success(res, formatDeposit(req, deposit), 'Fiat deposit submitted for verification', 201);
  } catch (e) {
    removeFiatProof(req.file);
    return next(e);
  }
}

export async function history(req, res, next) {
  try {
    const { status, type } = req.query;
    const filter = { userId: req.userId };
    if (status) filter.status = status;
    if (type) filter.type = type;

    const rows = await Deposit.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    const data = rows.map((row) => formatDeposit(req, row));
    return success(res, data, 'Deposit history fetched');
  } catch (e) {
    return next(e);
  }
}
