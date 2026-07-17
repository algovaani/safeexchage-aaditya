import mongoose from 'mongoose';

const tradingPairSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, unique: true, uppercase: true, trim: true },
    baseAsset: { type: String, required: true, uppercase: true },
    quoteAsset: { type: String, required: true, uppercase: true, default: 'USDT' },
    displayPair: { type: String, required: true },
    name: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    /** Legacy CoinGecko id (kept for older pairs; new adds use DexScreener). */
    coingeckoId: { type: String, default: '', index: true },
    cmcId: { type: Number, default: null },
    contractAddress: { type: String, default: '', lowercase: true, trim: true },
    /** Platform / chain key used by admin UI (ethereum, bsc, …) */
    contractChain: { type: String, default: '', trim: true },
    /** DexScreener pair address for live priceUsd polls */
    dexPairAddress: { type: String, default: '', trim: true },
    /** DexScreener chainId (ethereum, bsc, solana, …) */
    dexChainId: { type: String, default: '', trim: true, lowercase: true },
    /**
     * binance = CEX REST · dexscreener = DEX live USD ·
     * coingecko = legacy · commodity_inr = Gold/Silver
     */
    priceSource: {
      type: String,
      enum: ['binance', 'dexscreener', 'coingecko', 'commodity_inr'],
      default: 'binance',
    },
    category: { type: String, enum: ['crypto', 'commodity'], default: 'crypto', index: true },
    unit: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    /** Platform wallet users send deposits to (manual mode) */
    depositWalletAddress: { type: String, default: '', trim: true },
    /** BNB | ETH | TRC | BEP20 | ERC20 | TRC20 — maps to platform chain */
    depositNetwork: { type: String, default: '', trim: true },
    depositEnabled: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'trading_pairs' }
);

tradingPairSchema.index({ dexChainId: 1, dexPairAddress: 1 });

export const TradingPair = mongoose.model('TradingPair', tradingPairSchema);
