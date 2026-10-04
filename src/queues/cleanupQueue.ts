import { Queue, Worker } from 'bullmq';
import { createRedis } from '../redis';
import { prisma } from '../db';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { redis } from '../redis';
import { expireConfirmation, pendingKey } from '../confirmations/service';

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

/**
 * The pending-confirmation pointer in Redis carries the answer deadline (TTL). When it lapses the DB row is
 * still PENDING, so sweep: expire those rows (emits `confirmation.expired` reason=timeout, fails the run).
 */
export async function sweepExpiredConfirmations(): Promise<{ expired: number }> {
  const pending = await prisma.confirmation.findMany({
    where: { status: 'PENDING' },
    select: { id: true, userId: true },
    take: 200,
  });
  let expired = 0;
  for (const c of pending) {
    const live = await redis.get(pendingKey(c.userId));
    if (live === c.id) continue; // still within its deadline
    await expireConfirmation(c.id, live ? 'superseded' : 'timeout');
    expired++;
  }
  return { expired };
}

export function createCleanupWorker(): Worker {
  const workerConn = createRedis();
  const worker = new Worker(
    'unsaid_cleanup',
    async (job) => {
      if (job.name === 'confirmation_expiry_sweep') await sweepExpiredConfirmations();
      else await runRetentionCleanup();
    },
    { connection: workerConn, concurrency: 1 },
  );

  worker.once('closed', () => {
    void workerConn.quit().catch(() => undefined);
  });

  return worker;
}

export async function scheduleDailyCleanup(): Promise<void> {
  await cleanupQueue.upsertJobScheduler(
    'daily_retention_cleanup',
    { pattern: '0 3 * * *' },
    { name: 'daily_cleanup', data: {} },
  );
  await cleanupQueue.upsertJobScheduler(
    'confirmation_expiry_sweep',
    { every: 10_000 },
    { name: 'confirmation_expiry_sweep', data: {}, opts: { removeOnComplete: 5, removeOnFail: 20 } },
  );
}

export async function closeCleanupQueue(): Promise<void> {
  await cleanupQueue.close();
  await queueConn.quit().catch(() => undefined);
}
