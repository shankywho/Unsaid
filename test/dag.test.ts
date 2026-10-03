import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db';
import { redis } from '../src/redis';
import { runDag, out, type NodeDef } from '../src/orchestrator/dag';
import { finishRun, startRun } from '../src/tracing/tracer';
import { makeUser, resetAll } from './helpers';
import { sleep } from '../src/lib/time';

let userId: string;
let runId: string;

beforeAll(async () => {
  await resetAll();
  userId = (await makeUser()).id;
});
afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

const node = (
  name: string,
  deps: string[],
  fn: () => Promise<unknown> | unknown,
  extra: Partial<NodeDef> = {},
): NodeDef => ({
  name,
  deps,
  run: async () => ({ output: await fn() }),
  ...extra,
});

describe('DAG runner', () => {
  it('runs independent nodes in parallel and honours deps', async () => {
    runId = await startRun(userId, 'ASSIST', {}, true);
    const t0 = Date.now();
    const r = await runDag({ runId, userId }, [
      node('a', [], () => 1),
      node('b', ['a'], async () => (await sleep(150), 'b')),
      node('c', ['a'], async () => (await sleep(150), 'c')),
      node('d', ['b', 'c'], () => 'd'),
    ]);
    expect(Date.now() - t0).toBeLessThan(290); // b and c overlapped
    expect(out(r, 'd')).toBe('d');
    const steps = await prisma.step.findMany({ where: { runId }, orderBy: { startedAt: 'asc' } });
    expect(steps.map((s) => s.node).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(steps.every((s) => s.status === 'COMPLETED' && s.latencyMs !== null)).toBe(true);
    await finishRun(runId, userId, 'SUCCEEDED');
  });

  it('marks a failed node failed and skips its dependents', async () => {
    const id = await startRun(userId, 'ASSIST', {}, true);
    const r = await runDag({ runId: id, userId }, [
      node('boom', [], () => {
        throw new Error('kaput');
      }),
      node('after', ['boom'], () => 'never'),
      node('lenient', ['boom'], () => 'ran anyway', { allowFailedDeps: true }),
      node('independent', [], () => 'fine'),
    ]);
    expect(r.boom).toMatchObject({ status: 'failed', error: 'kaput' });
    expect(r.after.status).toBe('skipped');
    expect(out(r, 'lenient')).toBe('ran anyway');
    expect(out(r, 'independent')).toBe('fine');
    const step = await prisma.step.findFirst({ where: { runId: id, node: 'boom' } });
    expect(step).toMatchObject({ status: 'FAILED', error: 'kaput' });
  });

  it('records skip reasons', async () => {
    const id = await startRun(userId, 'ASSIST', {}, false);
    const r = await runDag({ runId: id, userId }, [
      node('retrieve', [], () => 'x', { skip: () => 'context disabled' }),
    ]);
    expect(r.retrieve).toMatchObject({ status: 'skipped', error: 'context disabled' });
    const step = await prisma.step.findFirst({ where: { runId: id } });
    expect(step?.status).toBe('SKIPPED');
    expect(step?.output).toMatchObject({ skipped: 'context disabled' });
  });

  it('rejects unknown dependencies', async () => {
    await expect(runDag({ runId, userId }, [node('x', ['nope'], () => 1)])).rejects.toThrow(/unknown node/);
  });
});
