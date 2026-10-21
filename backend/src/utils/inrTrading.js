import { getPairSync } from '../services/tradingPairService.js';
import { getPlatformSettings } from '../services/platformSettingsService.js';

let usdtInrRateCache = { rate: 83.5, at: 0 };
const INR_RATE_TTL_MS = 60_000;

async function getUsdtInrRate() {
  if (Date.now() - usdtInrRateCache.at < INR_RATE_TTL_MS) return usdtInrRateCache.rate;
  const settings = await getPlatformSettings();
  const rate = Number(settings.usdtInrRate) || 83.5;
  usdtInrRateCache = { rate, at: Date.now() };
  return rate;
}

export function isInrQuotedSymbol(symbol) {
  const pair = getPairSync(symbol);
  return pair?.quoteAsset === 'INR' || pair?.priceSource === 'commodity_inr';
}

/** Convert INR-denominated unit price to USDT for wallet settlement. */
export async function unitPriceToUsdt(symbol, unitPriceInr) {
  if (!isInrQuotedSymbol(symbol)) return Number(unitPriceInr);
  const rate = await getUsdtInrRate();
  return Number(unitPriceInr) / rate;
}
