/**
 * PM2 process file — run from backend/:
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup
 *
 * Layout:
 *   safex-api    — HTTP + WebSocket (cluster ×2). No TP/SL / futures / staking crons.
 *   safex-worker — Background monitors (+ future Moralis/Tron scanners). Single instance.
 *
 * Nginx (required for Socket.IO with cluster): sticky sessions
 *   upstream safex_api {
 *     ip_hash;
 *     server 127.0.0.1:5001;
 *   }
 */
module.exports = {
  apps: [
    {
      name: 'safex-api',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 2,
      exec_mode: 'cluster',
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
