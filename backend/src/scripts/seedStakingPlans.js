import 'dotenv/config';
import mongoose from 'mongoose';
import { resolveMongoUri } from '../config/resolveMongoUri.js';
import { StakingPlan } from '../models/StakingPlan.js';

const DEFAULT_PLANS = [
  {
    name: 'Silver',
    apyPercent: 15,
    lockDays: 30,
    minAmount: 50,
    maxAmount: 100000,
    payoutType: 'end_of_plan',
    payoutMode: 'auto',
    requiresApproval: false,
  },
  {
    name: 'Gold',
    apyPercent: 35,
    lockDays: 90,
    minAmount: 200,
    maxAmount: 500000,
    payoutType: 'end_of_plan',
    payoutMode: 'manual',
    requiresApproval: true,
  },
  {
    name: 'Platinum',
    apyPercent: 60,
    lockDays: 180,
    minAmount: 500,
    maxAmount: 1000000,
    payoutType: 'daily',
    payoutMode: 'auto',
    requiresApproval: false,
  },
  {
    name: 'Elite',
    apyPercent: 100,
    lockDays: 365,
    minAmount: 1000,
    maxAmount: 5000000,
    payoutType: 'end_of_plan',
    payoutMode: 'auto',
    requiresApproval: false,
  },
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
  console.log('Investment plans seed complete.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
