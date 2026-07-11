import { getPairSync } from '../services/tradingPairService.js';
import { getPlatformSettings } from '../services/platformSettingsService.js';

export function isInrQuotedSymbol(symbol) {
  const pair = getPairSync(symbol);
  return pair?.quoteAsset === 'INR' || pair?.priceSource === 'commodity_inr';
}

/** Convert INR-denominated unit price to USDT for wallet settlement. */
export async function unitPriceToUsdt(symbol, unitPriceInr) {
  if (!isInrQuotedSymbol(symbol)) return Number(unitPriceInr);
  const settings = await getPlatformSettings();
  const rate = Number(settings.usdtInrRate) || 83.5;
  return Number(unitPriceInr) / rate;
}
