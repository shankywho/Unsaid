import { Queue, Worker } from 'bullmq';
import { createRedis } from '../redis';
import { prisma } from '../db';
import { env } from '../config/env';
import { logger } from '../lib/logger';

const queueConn = createRedis();

export const cleanupQueue = new Queue('unsaid_cleanup', {
  connection: queueConn,
  defaultJobOptions: {
    removeOnComplete: 20,
    removeOnFail: 50,
  },
});

export async function runRetentionCleanup(): Promise<{ deleted: number }> {
  const retentionMs = env.RAW_TRANSCRIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - retentionMs);

  const result = await prisma.transcriptSegment.deleteMany({
    where: {
      isUser: false,
      createdAt: { lt: cutoff },
    },
  });

  logger.info({ deletedCount: result.count, cutoff }, 'Cleaned up expired raw ambient transcripts');
  return { deleted: result.count };
}

export function createCleanupWorker(): Worker {
  const workerConn = createRedis();
  const worker = new Worker(
    'unsaid_cleanup',
    async () => {
      await runRetentionCleanup();
    },
    { connection: workerConn, concurrency: 1 },
  );

  return worker;
}

export async function scheduleDailyCleanup(): Promise<void> {
  await cleanupQueue.upsertJobScheduler(
    'daily_retention_cleanup',
    { pattern: '0 3 * * *' },
    { name: 'daily_cleanup', data: {} },
  );
}
