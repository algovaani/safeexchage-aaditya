import 'dotenv/config';
import mongoose from 'mongoose';
import { resolveMongoUri } from '../config/resolveMongoUri.js';
import { User } from '../models/User.js';

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing');

  const email = (process.env.ADMIN_EMAIL || 'admin@safexchange.io').toLowerCase().trim();

  await mongoose.connect(await resolveMongoUri(uri), { serverSelectionTimeoutMS: 20_000 });

  const user = await User.findOneAndUpdate(
    { email },
    { $set: { role: 'admin' } },
    { new: true }
  );

  if (!user) {
    console.warn(`No user found with email "${email}". Register first, then re-run seed:admin.`);
  } else {
    console.log(`Granted admin role to ${email}`);
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
