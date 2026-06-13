import 'dotenv/config';
import mongoose from 'mongoose';
import { resolveMongoUri } from '../config/resolveMongoUri.js';
import { StakingPlan } from '../models/StakingPlan.js';

const DEFAULT_PLANS = [
  { name: '30-Day Flex', apyPercent: 8, lockDays: 30, minAmount: 50, maxAmount: 10000 },
  { name: '90-Day Growth', apyPercent: 18, lockDays: 90, minAmount: 200, maxAmount: 50000 },
  { name: '180-Day Pro', apyPercent: 28, lockDays: 180, minAmount: 500, maxAmount: 100000 },
  { name: '365-Day Elite', apyPercent: 45, lockDays: 365, minAmount: 1000, maxAmount: 500000 },
];

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing');

  await mongoose.connect(await resolveMongoUri(uri), { serverSelectionTimeoutMS: 20_000 });

  for (const p of DEFAULT_PLANS) {
    await StakingPlan.findOneAndUpdate(
      { name: p.name },
      { ...p, isActive: true },
      { upsert: true, new: true }
    );
    console.log('Seeded plan:', p.name);
  }

  await mongoose.disconnect();
  console.log('Staking plans seed complete.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
