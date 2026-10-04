import { Router } from 'express';
import { env } from '../../config/env';
import { prisma } from '../../db';
import { redis } from '../../redis';
import { qdrantHealthy } from '../../adapters/qdrant/client';
import { isShuttingDown } from '../../lib/shutdown';

const CHECK_TIMEOUT_MS = 2_000;

const timed = async (fn: () => Promise<unknown>): Promise<'ok' | 'down'> => {
  try {
    await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), CHECK_TIMEOUT_MS).unref()),
    ]);
    return 'ok';
  } catch {
    return 'down';
  }
};

export function lyzrConfigStatus(): string {
  if (env.MOCK_EXTERNALS) return 'mock';
  const ids = [
    env.LYZR_AGENT_FRAGMENT_ID,
    env.LYZR_AGENT_CONTEXT_EXTRACTOR_ID,
    env.LYZR_AGENT_HYPOTHESIS_ID,
    env.LYZR_AGENT_CONFIRM_ID,
    env.LYZR_AGENT_LEARNER_ID,
    env.LYZR_AGENT_UTTERANCE_CLASSIFIER_ID,
  ].filter(Boolean).length;
  if (env.LYZR_API_KEY && ids === 6) return 'configured';
  return `incomplete (${ids}/6 agent ids, key ${env.LYZR_API_KEY ? 'set' : 'missing'})`;
}

export const healthRouter = Router();

/** Liveness: the process is up. Never touches dependencies. */
healthRouter.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', uptimeSec: Math.round(process.uptime()) });
});

/** Readiness: dependencies reachable and Lyzr configured. 503 tells the platform not to route traffic. */
healthRouter.get('/readyz', async (_req, res) => {
  const [db, redisStatus, qdrant] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`),
    timed(() => redis.ping()),
    timed(qdrantHealthy),
  ]);
  const lyzr = lyzrConfigStatus();
  const lyzrOk = lyzr === 'mock' || lyzr === 'configured';
  const ok = db === 'ok' && redisStatus === 'ok' && qdrant === 'ok' && lyzrOk && !isShuttingDown();
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    mockExternals: env.MOCK_EXTERNALS,
    llmProvider: env.MOCK_EXTERNALS ? 'mock' : env.LLM_PROVIDER,
    db,
    redis: redisStatus,
    qdrant,
    lyzr,
  });
});
