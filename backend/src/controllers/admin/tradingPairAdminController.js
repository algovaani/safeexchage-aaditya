import { body, param, query } from 'express-validator';
import { error, success } from '../../utils/response.js';
import {
  createTradingPair,
  deleteTradingPair,
  formatPairRow,
  listTradingPairs,
  lookupByContract,
  resolveCoinGeckoPick,
  searchCoins,
  updateTradingPair,
} from '../../services/tradingPairService.js';
import { TradingPair } from '../../models/TradingPair.js';

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
    return success(res, rows, 'Coin search results');
  } catch (e) {
    return next(e);
  }
}

export async function previewContract(req, res, next) {
  try {
    const address = String(req.query.address || '').trim();
    const chain = String(req.query.chain || 'ethereum').trim();
    const draft = await lookupByContract(address, chain);
    return success(res, draft, 'Contract resolved');
  } catch (e) {
    if (e.status) return error(res, e.message, e.status);
    return next(e);
  }
}

export async function previewCoinGecko(req, res, next) {
  try {
    const id = String(req.query.id || '').trim();
    const draft = await resolveCoinGeckoPick(id);
    return success(res, draft, 'Coin resolved');
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

export const searchCoinValidators = [query('q').optional().isString()];
export const contractLookupValidators = [
  query('address').trim().notEmpty(),
  query('chain').optional().isString(),
];
export const coingeckoPreviewValidators = [query('id').trim().notEmpty()];
export const createPairValidators = [
  body('coingecko_id').optional({ nullable: true }).isString(),
  body('contract_address').optional({ nullable: true }).isString(),
  body('contract_chain').optional({ nullable: true }).isString(),
  body('symbol').optional({ nullable: true }).isString(),
  body('price_source').optional().isIn(['binance', 'coingecko']),
  body('is_active').optional().isBoolean(),
];
export const updatePairValidators = [
  param('id').isMongoId(),
  body('is_active').optional().isBoolean(),
  body('sort_order').optional().isInt({ min: 0 }),
  body('price_source').optional().isIn(['binance', 'coingecko']),
  body('name').optional().isString(),
  body('coingecko_id').optional({ nullable: true }).isString(),
];
export const pairIdValidators = [param('id').isMongoId()];
