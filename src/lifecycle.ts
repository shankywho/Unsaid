import type http from 'node:http';
import { logger } from './lib/logger';
import { markShuttingDown, sseClients } from './lib/shutdown';
import type { WorkersHandle } from './queues';
import { bus } from './tracing/events';
import { prisma } from './db';
import { redis } from './redis';

export interface ShutdownDeps {
  server: http.Server;
  workers: WorkersHandle;
}

export interface ShutdownOptions {
  /** Max time to let in-flight HTTP requests finish before dropping connections. */
  httpGraceMs?: number;
  /** Hard deadline for the whole shutdown; the process exits non-zero if it is exceeded. */
  deadlineMs?: number;
}

const step = async (name: string, fn: () => Promise<unknown>): Promise<void> => {
  try {
    await fn();
    logger.info({ step: name }, 'shutdown step done');
  } catch (err) {
    logger.error({ err, step: name }, 'shutdown step failed');
  }
};

/**
 * Ordered, idempotent shutdown: stop accepting HTTP (readyz -> 503), end SSE streams, drain in-flight
 * requests, then drain BullMQ workers (they may still publish events and write to the DB), then close the
 * event relay, Prisma and Redis. It deliberately does NOT call process.exit on success: if every handle was
 * closed the event loop empties on its own, which is what the shutdown test asserts.
 */
export function createShutdown(deps: ShutdownDeps, opts: ShutdownOptions = {}) {
  const { httpGraceMs = 10_000, deadlineMs = 25_000 } = opts;
  let running: Promise<void> | undefined;

  return (signal: string): Promise<void> => {
    if (running) return running;
    running = (async () => {
      logger.info({ signal }, 'Shutting down gracefully...');
      markShuttingDown();
      process.exitCode = 0;

      const watchdog = setTimeout(() => {
        logger.error({ deadlineMs }, 'Graceful shutdown deadline exceeded; forcing exit');
        process.exit(1);
      }, deadlineMs);
      watchdog.unref();

      await step('http', async () => {
        const closed = new Promise<void>((resolve) => deps.server.close(() => resolve()));
        for (const res of sseClients) res.end();
        sseClients.clear();
        deps.server.closeIdleConnections();
        const force = setTimeout(() => deps.server.closeAllConnections(), httpGraceMs);
        force.unref();
        await closed;
        clearTimeout(force);
      });
      await step('workers', () => deps.workers.stop());
      await step('event-relay', () => bus.stopRelay());
      await step('prisma', () => prisma.$disconnect());
      await step('redis', async () => {
        await redis.quit();
      });
      logger.info('Shutdown complete');
    })();
    return running;
  };
}
