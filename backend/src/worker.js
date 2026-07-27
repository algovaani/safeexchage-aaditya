/**
 * Background worker / scanner process — no HTTP listen.
 * Run via: PROCESS_ROLE=worker node src/worker.js
 * Or:      pm2 start ecosystem.config.cjs (safex-worker)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb, isDbConnected } from './config/db.js';
import { installProcessHandlers } from './config/processStability.js';
import { getProcessRole, shouldRunBackgroundJobs } from './config/processRole.js';
import { startBackgroundJobs, stopBackgroundJobs } from './jobs/backgroundJobs.js';

installProcessHandlers();

async function main() {
  if (!shouldRunBackgroundJobs()) {
    console.error(`[worker] PROCESS_ROLE=${getProcessRole()} — refusing to start (expected worker|all)`);
    process.exit(1);
  }

  process.env.PROCESS_ROLE = 'worker';

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is missing. Copy backend/.env.example to backend/.env');
  }

  const connectAttempts = process.env.NODE_ENV === 'production' ? 8 : 3;
  await connectDb(uri, { attempts: connectAttempts });
  console.log(`[worker] MongoDB connected (role=${getProcessRole()})`);

  await startBackgroundJobs({ io: null });
  console.log('[worker] Background jobs running — no HTTP server');

  if (!isDbConnected()) {
    console.warn('[worker] MongoDB disconnected after start — jobs will buffer until reconnect');
  }

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[worker] ${signal} — shutting down`);
    try {
      await stopBackgroundJobs();
      await mongoose.disconnect().catch(() => {});
    } catch (err) {
      console.error('[worker] shutdown failed:', err.message);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker]', err);
  process.exit(1);
});
