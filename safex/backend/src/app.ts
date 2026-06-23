import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import kycRoutes from './routes/kyc.routes.js';
import depositRoutes from './routes/deposit.routes.js';
import marketRoutes from './routes/market.routes.js';
import orderRoutes from './routes/order.routes.js';
import stakingRoutes from './routes/staking.routes.js';
import adminRoutes from './routes/admin.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import { errorHandler, notFound } from './middleware/error.js';

const app = express();

const origins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim());

const isDev = process.env.NODE_ENV !== 'production';

app.use(helmet());
app.use(
  cors({
    origin: isDev
      ? (origin, cb) => {
          if (!origin || origins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            cb(null, true);
          } else cb(new Error('CORS blocked'));
        }
      : origins,
    credentials: true,
  })
);
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'SafeXchange API healthy', data: { ok: true }, errors: null, timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/staking', stakingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
