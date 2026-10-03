import { Router } from 'express';
import { env } from '../../config/env';
import { prisma } from '../../db';
import { redis } from '../../redis';
import { qdrantHealthy } from '../../adapters/qdrant/client';

const timed = async (fn: () => Promise<unknown>): Promise<'ok' | 'down'> => {
  try {
    await fn();
    return 'ok';
  } catch {
    return 'down';
  }
};

export const healthRouter = Router();

healthRouter.get('/healthz', async (_req, res) => {
  const [db, redisStatus, qdrant] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`),
    timed(() => redis.ping()),
    timed(qdrantHealthy),
  ]);
  const lyzrAgents = [
    env.LYZR_AGENT_FRAGMENT_ID,
    env.LYZR_AGENT_CONTEXT_EXTRACTOR_ID,
    env.LYZR_AGENT_HYPOTHESIS_ID,
    env.LYZR_AGENT_CONFIRM_ID,
    env.LYZR_AGENT_LEARNER_ID,
    env.LYZR_AGENT_UTTERANCE_CLASSIFIER_ID,
  ].filter(Boolean).length;
  const lyzr = env.MOCK_EXTERNALS
    ? 'mock'
    : env.LYZR_API_KEY && lyzrAgents === 6
      ? 'configured'
      : `incomplete (${lyzrAgents}/6 agent ids, key ${env.LYZR_API_KEY ? 'set' : 'missing'})`;
  const ok = db === 'ok' && redisStatus === 'ok' && qdrant === 'ok';
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    mockExternals: env.MOCK_EXTERNALS,
    db,
    redis: redisStatus,
    qdrant,
    lyzr,
  });
});
