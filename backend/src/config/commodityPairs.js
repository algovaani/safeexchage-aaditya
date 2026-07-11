/** Gold & Silver quoted in INR per gram (Indian market style). */
export const TROY_OZ_GRAMS = 31.1034768;

export const COMMODITY_PAIRS = [
  {
    symbol: 'GOLDINR',
    baseAsset: 'GOLD',
    quoteAsset: 'INR',
    displayPair: 'GOLD/INR',
    name: 'Gold',
    coingeckoId: 'tether-gold',
    priceSource: 'commodity_inr',
    category: 'commodity',
    unit: 'g',
    sortOrder: 100,
  },
  {
    symbol: 'SILVERINR',
    baseAsset: 'SILVER',
    quoteAsset: 'INR',
    displayPair: 'SILVER/INR',
    name: 'Silver',
    coingeckoId: 'kinesis-silver',
    fallbackCoingeckoIds: ['silver'],
    priceSource: 'commodity_inr',
    category: 'commodity',
    unit: 'g',
    sortOrder: 101,
  },
];
