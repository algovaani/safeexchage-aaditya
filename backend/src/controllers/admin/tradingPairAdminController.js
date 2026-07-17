import { body, param, query } from 'express-validator';
import path from 'path';
import { error, success } from '../../utils/response.js';
import {
  createTradingPair,
  deleteTradingPair,
  formatPairRow,
  invalidateTradingPairCache,
  listTradingPairs,
  lookupByContract,
  refreshTradingPairCache,
  resolveDexPick,
  searchCoins,
  updateTradingPair,
} from '../../services/tradingPairService.js';
import { TradingPair } from '../../models/TradingPair.js';
import { removeCoinLogoFile, storedCoinLogoPath } from '../../middleware/coinLogoUpload.js';
import { toPublicFileUrl } from '../../utils/fileUrl.js';

export async function listPairs(req, res, next) {
  try {
    const includeInactive = req.query.include_inactive === '1' || req.query.include_inactive === 'true';
    const rows = await listTradingPairs({ includeInactive });
    return success(res, rows, 'Trading pairs fetched');
  } catch (e) {
    return next(e);
  }
}

export async function searchCoinCatalog(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return success(res, [], 'Enter at least 2 characters to search');
    }
    const rows = await searchCoins(q);
    return success(res, rows, 'DexScreener search results');
  } catch (e) {
    return next(e);
  }
}

export async function previewContract(req, res, next) {
  try {
    const address = String(req.query.address || '').trim();
    const chain = String(req.query.chain || 'ethereum').trim();
    const draft = await lookupByContract(address, chain);
    return success(res, draft, 'Token resolved via DexScreener');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function previewDexPair(req, res, next) {
  try {
    const chainId = String(req.query.chain || req.query.chainId || '').trim();
    const pairAddress = String(req.query.pair || req.query.pairAddress || '').trim();
    const draft = await resolveDexPick({ chainId, pairAddress });
    return success(res, draft, 'Dex pair resolved');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function addPair(req, res, next) {
  try {
    const row = await createTradingPair(req.body);
    return success(res, row, 'Trading pair added', 201);
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function patchPair(req, res, next) {
  try {
    const row = await updateTradingPair(req.params.id, req.body);
    return success(res, row, 'Trading pair updated');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function removePair(req, res, next) {
  try {
    const row = await deleteTradingPair(req.params.id);
    return success(res, row, 'Trading pair removed');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function getPair(req, res, next) {
  try {
    const row = await TradingPair.findById(req.params.id).lean();
    if (!row) return error(res, 'Pair not found', 404);
    return success(res, formatPairRow(row), 'Trading pair fetched');
  } catch (e) {
    return next(e);
  }
}

export async function uploadPairLogo(req, res, next) {
  try {
    if (!req.file) return error(res, 'Logo image file is required', 400);

    const pair = await TradingPair.findById(req.params.id);
    if (!pair) {
      removeCoinLogoFile(storedCoinLogoPath(path.basename(req.file.path)));
      return error(res, 'Pair not found', 404);
    }

    const previousPath = pair.imageUrl || '';
    const storedPath = storedCoinLogoPath(path.basename(req.file.path));
    pair.imageUrl = storedPath;
    await pair.save();

    if (previousPath && previousPath !== storedPath && previousPath.includes('uploads/coins/')) {
      removeCoinLogoFile(previousPath);
    }

    invalidateTradingPairCache();
    await refreshTradingPairCache();

    const row = formatPairRow(pair.toObject());
    return success(
      res,
      {
        ...row,
        imageUrl: toPublicFileUrl(req, storedPath),
        logoPath: storedPath,
      },
      'Coin logo uploaded'
    );
  } catch (e) {
    if (req.file?.path) {
      removeCoinLogoFile(storedCoinLogoPath(path.basename(req.file.path)));
    }
    return next(e);
  }
}

export const searchCoinValidators = [query('q').optional().isString()];
export const contractLookupValidators = [
  query('address').trim().notEmpty(),
  query('chain').optional().isString(),
];
export const dexPreviewValidators = [
  query('chain').optional().isString(),
  query('chainId').optional().isString(),
  query('pair').optional().isString(),
  query('pairAddress').optional().isString(),
];
export const createPairValidators = [
  body('dex_pair_address').optional({ nullable: true }).isString(),
  body('dex_chain_id').optional({ nullable: true }).isString(),
  body('contract_address').optional({ nullable: true }).isString(),
  body('contract_chain').optional({ nullable: true }).isString(),
  body('symbol').optional({ nullable: true }).isString(),
  body('price_source').optional().isIn(['binance', 'dexscreener', 'coingecko']),
  body('is_active').optional().isBoolean(),
];
export const updatePairValidators = [
  param('id').isMongoId(),
  body('is_active').optional().isBoolean(),
  body('sort_order').optional().isInt({ min: 0 }),
  body('price_source').optional().isIn(['binance', 'dexscreener', 'coingecko']),
  body('name').optional().isString(),
  body('image_url').optional({ nullable: true }).isString(),
  body('deposit_wallet_address').optional({ nullable: true }).isString(),
  body('deposit_network').optional({ nullable: true }).isString(),
  body('deposit_enabled').optional().isBoolean(),
  body('dex_pair_address').optional({ nullable: true }).isString(),
  body('dex_chain_id').optional({ nullable: true }).isString(),
];
export const pairIdValidators = [param('id').isMongoId()];
