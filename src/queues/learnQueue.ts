import { Queue, Worker, type Job } from 'bullmq';
import { createRedis } from '../redis';
import { logger } from '../lib/logger';
import { runLearnPipeline } from '../orchestrator/learnPipeline';

export interface LearnJobData {
  userId: string;
  fragment: string;
  confirmedSentence?: string;
  rejectedHypotheses?: string[];
  runId?: string;
}

const queueConn = createRedis();

export const learnQueue = new Queue<LearnJobData>('unsaid_learn', {
  connection: queueConn,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

export async function enqueueLearnJob(data: LearnJobData): Promise<void> {
  await learnQueue.add('learn', data);
}

export function createLearnWorker(): Worker<LearnJobData> {
  const workerConn = createRedis();
  const worker = new Worker<LearnJobData>(
    'unsaid_learn',
    async (job: Job<LearnJobData>) => {
      logger.info({ jobId: job.id, userId: job.data.userId }, 'Processing learn job');
      await runLearnPipeline(job.data);
    },
    { connection: workerConn, concurrency: 2 },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Learn job failed');
  });

  return worker;
}
