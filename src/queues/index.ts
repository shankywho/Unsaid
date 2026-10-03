import { createIngestWorker } from './ingestQueue';
import { createLearnWorker } from './learnQueue';
import { createCleanupWorker, scheduleDailyCleanup } from './cleanupQueue';
import { logger } from '../lib/logger';

export interface WorkersHandle {
  stop(): Promise<void>;
}

export function startWorkers(): WorkersHandle {
  const ingestWorker = createIngestWorker();
  const learnWorker = createLearnWorker();
  const cleanupWorker = createCleanupWorker();

  scheduleDailyCleanup().catch((err) => {
    logger.warn({ err: err.message }, 'Failed to schedule daily retention cleanup');
  });

  logger.info('BullMQ workers started for ingest, learn, and cleanup queues');

  return {
    async stop() {
      await Promise.all([ingestWorker.close(), learnWorker.close(), cleanupWorker.close()]);
      logger.info('BullMQ workers stopped');
    },
  };
}
