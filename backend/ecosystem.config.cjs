/**
 * PM2 process file — run from backend/:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 *
 * Production layout (3 processes by default):
 *   safex-api    ×1 — HTTP + WebSocket (default; set API_INSTANCES=2 to scale)
 *   safex-worker ×1 — order monitor, futures, TP/SL, staking (no HTTP)
 *
 * Why split api + worker?
 *   - API stays fast under load; heavy crons don't block HTTP.
 *   - Worker runs spot order fills even when nobody has the chart open.
 *
 * Scaling API to 2+ instances:
 *   Set REDIS_URL in .env — enables Socket.IO Redis adapter + shared live market state.
 *   Worker (safex-worker) is preferred market leader for Binance WS ingest.
 *   API_INSTANCES=2 without Redis still needs Nginx ip_hash sticky sessions.
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const apiInstances = Math.max(1, Math.min(Number(process.env.API_INSTANCES) || 1, 4));

module.exports = {
  apps: [
    {
      name: 'safex-api',
      script: 'src/server.js',
      cwd: __dirname,
      instances: apiInstances,
      exec_mode: apiInstances > 1 ? 'cluster' : 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      exp_backoff_restart_delay: 2000,
      max_restarts: 50,
      min_uptime: 5000,
      kill_timeout: 16_000,
      env: {
        NODE_ENV: 'production',
        PROCESS_ROLE: 'api',
        PORT: 5001,
      },
    },
    {
      name: 'safex-worker',
      script: 'src/worker.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      exp_backoff_restart_delay: 2000,
      max_restarts: 50,
      min_uptime: 5000,
      env: {
        NODE_ENV: 'production',
        PROCESS_ROLE: 'worker',
      },
    },
  ],
};
