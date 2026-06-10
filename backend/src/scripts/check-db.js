import 'dotenv/config';
import dns from 'dns/promises';
import mongoose from 'mongoose';
import { resolveMongoUri } from '../config/resolveMongoUri.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set in backend/.env');
  process.exit(1);
}

const hostMatch = uri.match(/@([^/]+)/);
const srvHost = hostMatch?.[1]?.replace(/:.*/, '') || '';

console.log('Checking MongoDB…\n');

if (srvHost.includes('.mongodb.net')) {
  try {
    const records = await dns.resolveSrv(`_mongodb._tcp.${srvHost}`);
    console.log(`DNS SRV: OK (${records.length} shard host(s))`);
  } catch (e) {
    console.log('DNS SRV: FAIL —', e.message);
  }
}

try {
  const resolved = await resolveMongoUri(uri);
  if (resolved !== uri) console.log('Using direct MongoDB URI (SRV DNS fallback)');
  await mongoose.connect(resolved, { serverSelectionTimeoutMS: 20_000 });
  console.log('MongoDB: CONNECTED —', mongoose.connection.host);
  await mongoose.disconnect();
  process.exit(0);
} catch (e) {
  console.log('MongoDB: FAILED');
  console.log(e.message.split('\n')[0]);
  console.log('\nIP whitelist looks fine if you added 0.0.0.0/0. Try instead:');
  console.log('  1. Atlas → Database → ensure cluster is not Paused (Resume if needed)');
  console.log('  2. Atlas → Database → Connect → copy a NEW connection string into backend/.env');
  console.log('  3. Atlas → Database Access → reset user password; URL-encode special chars (! → %21)');
  console.log('  4. Disable VPN; try another network if port 27017 is blocked');
  console.log('  5. Or use local: MONGODB_URI=mongodb://127.0.0.1:27017/safex');
  console.log('  6. Do not run backend with sudo — it can break DNS on macOS');
  if (e.reason?.servers?.size) {
    console.log('\nShard status:');
    for (const [host, s] of e.reason.servers) {
      console.log(`  ${host} → ${s.type}${s.error ? ` (${s.error.message || s.error})` : ''}`);
    }
  }
  process.exit(1);
}
