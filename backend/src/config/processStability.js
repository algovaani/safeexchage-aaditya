/**
 * Keep the API process alive — log async/sync faults instead of silent exit.
 * PM2 / systemd should still restart on repeated failures.
 */
import { recordSystemLog } from '../services/systemLogService.js';

export function installProcessHandlers() {
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
    console.error('[process] unhandledRejection:', msg);
    void recordSystemLog({
      level: 'error',
      source: 'unhandledRejection',
      error: reason instanceof Error ? reason : undefined,
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : '',
      meta: reason instanceof Error ? undefined : { reason: String(reason).slice(0, 2000) },
    });
  });

  process.on('uncaughtException', (err) => {
    console.error('[process] uncaughtException:', err.stack || err.message);
    void recordSystemLog({
      level: 'fatal',
      source: 'uncaughtException',
      error: err,
      message: err?.message || 'Uncaught exception',
      stack: err?.stack || '',
    });
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
      void recordSystemLog({
        level: 'error',
        source: 'process',
        message: `Shutdown hook failed: ${err.message}`,
        stack: err.stack || '',
        meta: { signal },
      });
    }

    server.close(() => {
      console.info('[process] HTTP server closed');
      process.exit(0);
    });

    setTimeout(() => {
      console.error('[process] forced exit after shutdown timeout');
      void recordSystemLog({
        level: 'fatal',
        source: 'process',
        message: 'Forced exit after shutdown timeout',
        location: 'processStability.js:shutdown',
        meta: { signal },
      });
      process.exit(1);
    }, 15_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
