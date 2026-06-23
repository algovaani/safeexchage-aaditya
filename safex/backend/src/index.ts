import 'dotenv/config';
import http from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';
import app from './app.js';
import { connectRedis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { startBinanceStream, getAllPrices } from './services/binance.service.js';
import { startCronJobs } from './jobs/cron.js';

const PORT = Number(process.env.PORT || 5000);

async function main() {
  await connectRedis();
  await prisma.$connect();

  startBinanceStream();
  startCronJobs();

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true },
  });

  cron.schedule('* * * * * *', () => {
    io.emit('price_update', getAllPrices());
  });

  io.on('connection', (socket) => {
    socket.emit('price_update', getAllPrices());
    socket.on('disconnect', () => {});
  });

  server.listen(PORT, () => {
    console.log(`SafeXchange API listening on http://localhost:${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
