import { createIngestWorker, closeIngestQueue } from './ingestQueue';
import { createLearnWorker, closeLearnQueue } from './learnQueue';
import { createCleanupWorker, scheduleDailyCleanup, closeCleanupQueue } from './cleanupQueue';
import { logger } from '../lib/logger';

export interface WorkersHandle {
  /** Stop taking jobs, wait for in-flight ones, then close queues and their Redis connections. */
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
      // worker.close() waits for active jobs to finish
      await Promise.all([ingestWorker.close(), learnWorker.close(), cleanupWorker.close()]);
      await Promise.all([closeIngestQueue(), closeLearnQueue(), closeCleanupQueue()]);
      logger.info('BullMQ workers and queues stopped');
    },
  };
}
