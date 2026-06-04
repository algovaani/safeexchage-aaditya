import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { Server } from 'socket.io';
import { connectDb } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import kycRoutes from './routes/kycRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import marketRoutes from './routes/marketRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { ensureMarketStream, roomName } from './services/marketStreamService.js';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

app.set('io', io);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

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
  res.json({ ok: true, service: 'vancrypto-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/admin', adminRoutes);

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

const PORT = Number(process.env.PORT) || 5000;

async function main() {
  await connectDb(process.env.MONGODB_URI);
  server.listen(PORT, () => {
    console.log(`API + WebSocket listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
