/** PM2 process file — run from backend/: pm2 start ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: 'safex-api',
      script: 'src/server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      exp_backoff_restart_delay: 2000,
      max_restarts: 50,
      min_uptime: 5000,
      env: {
        NODE_ENV: 'production',
        PORT: 5001,
      },
    },
  ],
};
