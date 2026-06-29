/**
 * Keep the API process alive — log async/sync faults instead of silent exit.
 * PM2 / systemd should still restart on repeated failures.
 */
export function installProcessHandlers() {
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
    console.error('[process] unhandledRejection:', msg);
  });

  process.on('uncaughtException', (err) => {
    console.error('[process] uncaughtException:', err.stack || err.message);
  });
}

export function installGracefulShutdown(server, { onShutdown } = {}) {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[process] ${signal} — shutting down`);

    try {
      await onShutdown?.();
    } catch (err) {
      console.error('[process] shutdown hook failed:', err.message);
    }

    server.close(() => {
      console.info('[process] HTTP server closed');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[process] forced exit after shutdown timeout');
      process.exit(1);
    }, 15_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
