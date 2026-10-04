import { Queue, Worker, type Job } from 'bullmq';
import { createRedis, redis } from '../redis';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { runIngestPipeline, type IngestSegmentInput } from '../orchestrator/ingestPipeline';

export interface IngestJobData {
  userId: string;
  sessionId: string;
}

const queueConn = createRedis();

export const ingestQueue = new Queue<IngestJobData>('unsaid_ingest', {
  connection: queueConn,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export const bufferKey = (userId: string, sessionId: string): string =>
  `unsaid:buffer:${userId}:${sessionId}`;

export async function bufferSegment(
  userId: string,
  sessionId: string,
  segment: IngestSegmentInput,
): Promise<{ count: number; flushed: boolean }> {
  const key = bufferKey(userId, sessionId);
  const count = await redis.rpush(key, JSON.stringify(segment));

  if (count >= env.INGEST_WINDOW_SIZE) {
    await ingestQueue.add(
      'flush',
      { userId, sessionId },
      { jobId: `flush_${userId}_${sessionId}_${Date.now()}` },
    );
    return { count, flushed: true };
  } else {
    // Schedule delayed idle flush
    await ingestQueue.add(
      'flush',
      { userId, sessionId },
      { delay: env.INGEST_IDLE_SEC * 1000, jobId: `idle_${userId}_${sessionId}` },
    );
    return { count, flushed: false };
  }
}

export async function flushBufferDirect(userId: string, sessionId: string): Promise<number> {
  const key = bufferKey(userId, sessionId);
  const items = await redis.lrange(key, 0, -1);
  if (items.length === 0) return 0;
  await redis.del(key);

  const segments: IngestSegmentInput[] = items.map((i) => JSON.parse(i));
  await runIngestPipeline({ userId, sessionId, segments });
  return segments.length;
}

export function createIngestWorker(): Worker<IngestJobData> {
  const workerConn = createRedis();
  const worker = new Worker<IngestJobData>(
    'unsaid_ingest',
    async (job: Job<IngestJobData>) => {
      const { userId, sessionId } = job.data;
      const count = await flushBufferDirect(userId, sessionId);
      logger.info({ userId, sessionId, count, jobId: job.id }, 'Ingest job processed buffer');
    },
    { connection: workerConn, concurrency: 4 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Ingest job failed');
  });

  worker.once('closed', () => {
    void workerConn.quit().catch(() => undefined);
  });

  return worker;
}

export async function closeIngestQueue(): Promise<void> {
  await ingestQueue.close();
  await queueConn.quit().catch(() => undefined);
}
