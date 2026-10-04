import type { Prisma, PipelineKind, RunStatus, StepStatus } from '@prisma/client';
import { prisma } from '../db';
import { bus } from './events';
import { backoffStorage } from '../lib/http';
import { stepService } from './services';

/** Run start times, so every step can report its offset on one shared timeline. */
const runStarts = new Map<string, number>();
const noteRunStart = (runId: string, at: number) => {
  runStarts.set(runId, at);
  if (runStarts.size > 500) runStarts.delete(runStarts.keys().next().value as string);
};
const offsetOf = (runId: string, at: number) => Math.max(0, at - (runStarts.get(runId) ?? at));

export const preview = (v: unknown, max = 300): string => {
  const s = typeof v === 'string' ? v : (JSON.stringify(v) ?? '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

const json = (v: unknown): Prisma.InputJsonValue =>
  v === undefined ? {} : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

export async function startRun(
  userId: string,
  pipeline: PipelineKind,
  input: unknown,
  contextUsed: boolean,
): Promise<string> {
  const run = await prisma.run.create({
    data: { userId, pipeline, status: 'RUNNING', input: json(input), contextUsed },
  });
  noteRunStart(run.id, run.startedAt.getTime());
  bus.publish('run.started', userId, { pipeline, contextUsed }, run.id);
  return run.id;
}

export async function finishRun(
  runId: string,
  userId: string,
  status: RunStatus,
  output?: unknown,
): Promise<void> {
  const terminal = status === 'SUCCEEDED' || status === 'FAILED';
  await prisma.run.update({
    where: { id: runId },
    data: {
      status,
      output: output === undefined ? undefined : json(output),
      endedAt: terminal ? new Date() : undefined,
    },
  });
  bus.publish(
    'run.completed',
    userId,
    { status, output: output === undefined ? undefined : preview(output) },
    runId,
  );
}

import { logger } from '../lib/logger';

export interface StepMeta {
  agentId?: string;
  attempt?: number;
  input?: unknown;
  retrieval?: unknown;
  backoffMs?: number;
}

export async function startStep(
  runId: string,
  userId: string,
  node: string,
  input: unknown,
): Promise<string> {
  const step = await prisma.step.create({
    data: { runId, node, status: 'RUNNING', input: json(input) },
  });
  bus.publish(
    'step.started',
    userId,
    {
      stepId: step.id,
      node,
      startOffsetMs: offsetOf(runId, step.startedAt.getTime()),
      service: stepService(node),
    },
    runId,
  );
  return step.id;
}

export async function endStep(
  stepId: string,
  runId: string,
  userId: string,
  node: string,
  status: Exclude<StepStatus, 'RUNNING'>,
  startedAt: number,
  output: unknown,
  meta: StepMeta = {},
  error?: string,
): Promise<number> {
  const totalElapsed = Date.now() - startedAt;
  const backoffMs = meta.backoffMs ?? backoffStorage.getStore()?.backoffMs ?? 0;
  const latencyMs = Math.max(0, totalElapsed - backoffMs);
  if (backoffMs > 0) {
    logger.info(
      { node, runId, latencyMs, backoffMs, totalElapsed },
      'Step excluded 429 backoff time from latency',
    );
  }
  await prisma.step.update({
    where: { id: stepId },
    data: {
      status,
      output: output === undefined ? undefined : json(output),
      error,
      latencyMs,
      endedAt: new Date(),
      agentId: meta.agentId,
      attempt: meta.attempt,
      retrieval: meta.retrieval === undefined ? undefined : json(meta.retrieval),
      ...(meta.input !== undefined ? { input: json(meta.input) } : {}),
    },
  });
  const data = {
    stepId,
    node,
    agentId: meta.agentId,
    startOffsetMs: offsetOf(runId, startedAt),
    service: stepService(node, meta.agentId),
    latencyMs,
    backoffMs,
    status,
    outputPreview: output === undefined ? undefined : preview(output),
    retrieval: meta.retrieval,
    error,
  };
  bus.publish(status === 'FAILED' ? 'step.failed' : 'step.completed', userId, data, runId);
  return latencyMs;
}
