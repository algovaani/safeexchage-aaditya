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
import tradeRoutes from './routes/tradeRoutes.js';
import stakingRoutes from './routes/stakingRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import { ensureMarketStream, roomName } from './services/marketStreamService.js';
import { startMonitor } from './services/tpslMonitor.js';
import { startStakingCron } from './services/stakingRewardService.js';
import { getCorsAllowedOrigins } from './config/cors.js';

const app = express();
const server = http.createServer(app);

const corsOrigin = getCorsAllowedOrigins();

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  },
});

app.set('io', io);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (_req, res) => {
  const dbOk = mongoose.connection.readyState === 1;
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

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is missing. Copy backend/.env.example to backend/.env');
  }
  try {
    await connectDb(uri);
    console.log('MongoDB connected');
    startMonitor();
    startStakingCron();
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    if (process.env.NODE_ENV === 'production') throw err;
    console.warn(
      'Dev mode: API will listen, but auth/wallet routes return 503 until MongoDB is reachable.'
    );
  }

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`API + WebSocket listening on :${PORT}`);
    if (mongoose.connection.readyState !== 1) {
      console.warn(
      'MongoDB still unreachable. Run: npm run db:check — then fix cluster/credentials or use local MONGODB_URI.'
    );
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
