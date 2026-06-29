import 'dotenv/config';
import http from 'http';
import path from 'path';
import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { connectDb } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { success } from './utils/response.js';
import { requireDb } from './middleware/requireDb.js';
import authRoutes from './routes/authRoutes.js';
import kycRoutes from './routes/kycRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import marketRoutes from './routes/marketRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { depositRouter, depositsRouter } from './routes/depositRoutes.js';
import { withdrawalRouter, withdrawalsRouter } from './routes/withdrawalRoutes.js';
import tradeRoutes from './routes/tradeRoutes.js';
import stakingRoutes from './routes/stakingRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import { ensureMarketStream, roomName } from './services/marketStreamService.js';
import { startMonitor } from './services/tpslMonitor.js';
import { startStakingCron } from './services/stakingRewardService.js';
import { startChainDepositWatcher } from './services/chainWatcherService.js';
import { evmScannerStatus } from './services/evmDepositScanService.js';
import { getCorsAllowedOrigins, corsPreflightMiddleware, logCorsConfig } from './config/cors.js';
import { installGracefulShutdown, installProcessHandlers } from './config/processStability.js';
import { isDbConnected } from './config/db.js';

installProcessHandlers();

const app = express();
const server = http.createServer(app);

// Behind Nginx/Apache — use real client IP for rate limiting
if (process.env.TRUST_PROXY !== '0') {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

const corsOrigin = getCorsAllowedOrigins();
logCorsConfig();

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  },
});

app.set('io', io);

app.use(corsPreflightMiddleware);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    optionsSuccessStatus: 204,
    preflightContinue: false,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/', (_req, res) => {
  res.json({
    service: 'safex-backend',
    health: '/api/health',
    market: '/api/market/prices/live',
    hint: 'All API routes are under /api — e.g. /api/auth/login, /api/market/ticker',
  });
});

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.API_RATE_LIMIT_MAX) || 500,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS' || /\/auth\/otp\//.test(req.originalUrl),
  })
);

app.get('/api/health', (_req, res) => {
  const dbOk = isDbConnected();
  return success(
    res,
    {
      ok: dbOk,
      service: 'safex-backend',
      database: dbOk ? 'connected' : 'disconnected',
    },
    dbOk ? 'Service healthy' : 'Database disconnected',
    dbOk ? 200 : 503
  );
});

app.use('/api', requireDb);

app.use('/api/auth', authRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/deposit', depositRouter);
app.use('/api/deposits', depositsRouter);
app.use('/api/withdrawal', withdrawalRouter);
app.use('/api/withdrawals', withdrawalsRouter);
app.use('/api/orders', orderRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/staking', stakingRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

io.on('connection', (socket) => {
  socket.on('market:subscribe', ({ symbol, interval }) => {
    if (!symbol || !interval) return;
    const room = roomName(symbol, interval);
    socket.join(room);
    ensureMarketStream(io, symbol, interval);
  });

  socket.on('market:unsubscribe', ({ symbol, interval }) => {
    if (!symbol || !interval) return;
    socket.leave(roomName(symbol, interval));
  });
});

const PORT = Number(process.env.PORT) || 5001;
let chainWatcherTimer = null;

async function startBackgroundJobs() {
  startMonitor();
  startStakingCron();
  chainWatcherTimer = startChainDepositWatcher();
  const scan = evmScannerStatus();
  if (scan.moralis && scan.tatum) {
    console.info('[deposits] BNB/ETH: Moralis primary, Tatum fallback');
  } else if (scan.moralis) {
    console.info('[deposits] BNB/ETH: Moralis enabled');
  } else if (scan.tatum) {
    console.info('[deposits] BNB/ETH: Tatum enabled');
  } else {
    console.warn('[deposits] Set MORALIS_API_KEY or TATUM_MAINNET_API_KEY for BNB/ETH auto-deposits');
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is missing. Copy backend/.env.example to backend/.env');
  }

  const connectAttempts = process.env.NODE_ENV === 'production' ? 8 : 3;
  try {
    await connectDb(uri, { attempts: connectAttempts });
    console.log('MongoDB connected');
    await startBackgroundJobs();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[mongodb] API will listen — DB routes return 503 until connection succeeds (auto-retry in background)'
      );
      await startBackgroundJobs();
    } else {
      console.warn(
        'Dev mode: API will listen, but auth/wallet routes return 503 until MongoDB is reachable.'
      );
    }
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} already in use — stop the other process or change PORT in .env`);
    } else {
      console.error('HTTP server error:', err.message);
    }
    process.exit(1);
  });

  server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
    console.log(`API + WebSocket listening on :${PORT}`);
    if (!isDbConnected()) {
      console.warn(
        'MongoDB still unreachable. Run: npm run db:check — then fix cluster/credentials or use local MONGODB_URI.'
      );
    }
  });

  installGracefulShutdown(server, {
    onShutdown: async () => {
      const { stopMonitor } = await import('./services/tpslMonitor.js');
      const { stopStakingCron } = await import('./services/stakingRewardService.js');
      stopMonitor();
      stopStakingCron();
      if (chainWatcherTimer) {
        clearInterval(chainWatcherTimer);
        chainWatcherTimer = null;
      }
      await mongoose.disconnect().catch(() => {});
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
