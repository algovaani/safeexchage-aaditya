import 'dotenv/config';
import mongoose from 'mongoose';
import { resolveMongoUri } from '../config/resolveMongoUri.js';
import { getMongoConnectOptions } from '../config/db.js';
import { TRADING_PAIRS } from '../config/tradingPairs.js';
import { COINGECKO_IDS } from '../config/coingeckoIds.js';
import { TradingPair } from '../models/TradingPair.js';

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing');

  await mongoose.connect(await resolveMongoUri(uri), getMongoConnectOptions());

  for (let i = 0; i < TRADING_PAIRS.length; i += 1) {
    const p = TRADING_PAIRS[i];
    await TradingPair.findOneAndUpdate(
      { symbol: p.symbol },
      {
        symbol: p.symbol,
        baseAsset: p.baseAsset,
        quoteAsset: p.quoteAsset,
        displayPair: p.displayPair,
        name: p.baseAsset,
        coingeckoId: COINGECKO_IDS[p.symbol] || '',
        priceSource: 'binance',
        isActive: true,
        sortOrder: i + 1,
      },
      { upsert: true, new: true }
    );
    console.log('Seeded pair:', p.displayPair);
  }

  await mongoose.disconnect();
  console.log('Trading pairs seed complete.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
