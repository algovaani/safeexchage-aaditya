import mongoose from 'mongoose';
import { resolveMongoUri } from './resolveMongoUri.js';

export async function connectDb(uri) {
  mongoose.set('strictQuery', true);
  const resolved = await resolveMongoUri(uri);
  await mongoose.connect(resolved, { serverSelectionTimeoutMS: 10_000 });
  return mongoose.connection;
}
