import mongoose from 'mongoose';

const tradingPairSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, unique: true, uppercase: true, trim: true },
    baseAsset: { type: String, required: true, uppercase: true },
    quoteAsset: { type: String, required: true, uppercase: true, default: 'USDT' },
    displayPair: { type: String, required: true },
    name: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    /** CoinGecko coin id — used for price/chart when not on Binance. */
    coingeckoId: { type: String, default: '', index: true },
    /** CoinMarketCap numeric id (optional). */
    cmcId: { type: Number, default: null },
    contractAddress: { type: String, default: '', lowercase: true, trim: true },
    /** CoinGecko platform id, e.g. ethereum, binance-smart-chain */
    contractChain: { type: String, default: '', trim: true },
    /** binance = Binance REST; coingecko = CoinGecko prices + charts; commodity_inr = Gold/Silver in INR */
    priceSource: { type: String, enum: ['binance', 'coingecko', 'commodity_inr'], default: 'binance' },
    category: { type: String, enum: ['crypto', 'commodity'], default: 'crypto', index: true },
    /** Display unit for commodities, e.g. g (per gram) */
    unit: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'trading_pairs' }
);

export const TradingPair = mongoose.model('TradingPair', tradingPairSchema);
