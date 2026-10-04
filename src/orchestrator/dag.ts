import type { StepMeta } from '../tracing/tracer';
import { endStep, startStep } from '../tracing/tracer';
import { backoffStorage } from '../lib/http';
import { logger } from '../lib/logger';

export type NodeResults = Record<string, NodeOutcome>;

export interface NodeOutcome<T = unknown> {
  status: 'completed' | 'failed' | 'skipped';
  output?: T;
  error?: string;
}

export interface NodeReturn<T = unknown> extends StepMeta {
  output: T;
}

export interface NodeDef {
  name: string;
  deps?: string[];
  /** Recorded as Step.input when the node starts. */
  input?: (results: NodeResults) => unknown;
  /** Return a reason to skip the node (recorded as a SKIPPED step). */
  skip?: (results: NodeResults) => string | null;
  /** Run even if a dependency failed/was skipped (the node must cope with missing outputs). */
  allowFailedDeps?: boolean;
  run: (results: NodeResults) => Promise<NodeReturn>;
}

export interface DagContext {
  runId: string;
  userId: string;
}

/** Output of a completed dependency, typed by the caller. */
export function out<T>(results: NodeResults, name: string): T | undefined {
  return results[name]?.status === 'completed' ? (results[name].output as T) : undefined;
}

/**
 * Tiny DAG runner: a node starts as soon as all its deps have settled, so independent
 * nodes run in parallel. Never throws — failures are recorded per node and dependents
 * are skipped unless they set `allowFailedDeps`. The caller decides degrade vs fail.
 */
export async function runDag(
  ctx: DagContext,
  nodes: NodeDef[],
  seed: NodeResults = {},
): Promise<NodeResults> {
  const names = new Set(nodes.map((n) => n.name));
  for (const n of nodes) {
    for (const d of n.deps ?? []) {
      if (!names.has(d) && !(d in seed)) throw new Error(`DAG node ${n.name} depends on unknown node ${d}`);
    }
  }
  const results: NodeResults = { ...seed };
  const started = new Map<string, Promise<void>>();

  const exec = (node: NodeDef): Promise<void> => {
    let p = started.get(node.name);
    if (p) return p;
    p = (async () => {
      await Promise.all(
        (node.deps ?? []).map((d) => (names.has(d) ? exec(nodes.find((n) => n.name === d)!) : undefined)),
      );
      const t0 = Date.now();
      const input = node.input?.(results) ?? { deps: node.deps ?? [] };
      const stepId = await startStep(ctx.runId, ctx.userId, node.name, input);

      const badDep = (node.deps ?? []).find((d) => results[d] && results[d].status !== 'completed');
      if (badDep && !node.allowFailedDeps) {
        const reason = `dependency ${badDep} ${results[badDep].status}`;
        results[node.name] = { status: 'skipped', error: reason };
        await endStep(stepId, ctx.runId, ctx.userId, node.name, 'SKIPPED', t0, { skipped: reason });
        return;
      }
      const skipReason = node.skip?.(results);
      if (skipReason) {
        results[node.name] = { status: 'skipped', output: undefined, error: skipReason };
        await endStep(stepId, ctx.runId, ctx.userId, node.name, 'SKIPPED', t0, { skipped: skipReason });
        return;
      }
      const store = { backoffMs: 0 };
      try {
        const r = await backoffStorage.run(store, () => node.run(results));
        results[node.name] = { status: 'completed', output: r.output };
        await endStep(stepId, ctx.runId, ctx.userId, node.name, 'COMPLETED', t0, r.output, {
          ...r,
          backoffMs: store.backoffMs,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn({ node: node.name, runId: ctx.runId, err: message }, 'dag node failed');
        results[node.name] = { status: 'failed', error: message };
        await endStep(
          stepId,
          ctx.runId,
          ctx.userId,
          node.name,
          'FAILED',
          t0,
          undefined,
          {
            backoffMs: store.backoffMs,
          },
          message,
        );
      }
    })();
    started.set(node.name, p);
    return p;
  };

  await Promise.all(nodes.map(exec));
  return results;
}
