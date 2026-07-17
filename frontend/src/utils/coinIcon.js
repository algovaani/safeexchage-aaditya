import { resolveAssetUrl } from './assetUrl.js';

/** Lowercase slug for spothq/cryptocurrency-icons CDN */
const ICON_SLUG = {
  BTC: 'btc',
  ETH: 'eth',
  BNB: 'bnb',
  SOL: 'sol',
  XRP: 'xrp',
  DOGE: 'doge',
  ADA: 'ada',
  TRX: 'trx',
  POL: 'matic',
  MATIC: 'matic',
  AVAX: 'avax',
  DOT: 'dot',
  LINK: 'link',
  LTC: 'ltc',
};

const CG_ICON = {
  bitcoin: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  ethereum: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  binancecoin: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  solana: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
  ripple: 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
  dogecoin: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
  cardano: 'https://assets.coingecko.com/coins/images/975/small/cardano.png',
  tron: 'https://assets.coingecko.com/coins/images/1094/small/tron-logo.png',
  'polygon-ecosystem-token': 'https://assets.coingecko.com/coins/images/32440/small/polygon.png',
};

export function resolveCoinIconUrl({ imageUrl, symbol, coingeckoId, type, baseAsset } = {}) {
  if (imageUrl) return resolveAssetUrl(imageUrl);
  if (type === 'commodity') return null;

  const cg = String(coingeckoId || '').trim();
  if (cg && CG_ICON[cg]) return CG_ICON[cg];

  let base = String(baseAsset || symbol || '').toUpperCase();
  base = base.replace(/USDT$|BUSD$|USDC$|INR$/i, '') || base;
  const slug = ICON_SLUG[base] || base.toLowerCase();
  if (!slug) return null;

  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${slug}.png`;
}

export function coinIconFallbackLabel(row) {
  const sym = String(row?.baseAsset || row?.symbol || '?').toUpperCase();
  if (row?.type === 'commodity' || sym.endsWith('INR') || sym === 'GOLD' || sym === 'SILVER') {
    if (sym.includes('GOLD') || sym === 'XAU') return 'Au';
    if (sym.includes('SILVER') || sym === 'XAG') return 'Ag';
  }
  const base = sym.replace(/USDT$|BUSD$|USDC$|INR$/i, '') || sym;
  return base.slice(0, 2);
}
