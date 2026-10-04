import { env } from './config/env';
import { createApp } from './http/app';
import { bootstrapQdrant } from './adapters/qdrant/collections';
import { startWorkers } from './queues';
import { logger } from './lib/logger';
import { createShutdown } from './lifecycle';

async function main(): Promise<void> {
  logger.info({ nodeEnv: env.NODE_ENV, mock: env.MOCK_EXTERNALS }, 'Booting Unsaid backend...');

  // 1. Verify / bootstrap vector collections
  await bootstrapQdrant();

  // 2. Start BullMQ background workers
  const workers = startWorkers();

  // 3. Start HTTP server
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, publicBase: env.PUBLIC_BASE_URL, mock: env.MOCK_EXTERNALS },
      '🚀 Unsaid backend listening',
    );
  });

  const shutdown = createShutdown({ server, workers });
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Boot failed');
  process.exit(1);
});
