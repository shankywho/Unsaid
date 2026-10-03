import { prisma } from '../db';
import { runDag, out } from './dag';
import { startRun, finishRun } from '../tracing/tracer';
import { runAgent } from '../agents/runAgent';
import { ContextExtractorOutputSchema, type ContextFact } from '../agents/schemas';
import { upsertMemoryFact } from '../memory/memoryStore';
import { bus } from '../tracing/events';
import { adapters } from '../adapters';
import { logger } from '../lib/logger';

export interface IngestSegmentInput {
  text: string;
  speaker?: string | null;
  id?: string;
  startSec?: number | null;
  endSec?: number | null;
}

export interface IngestPipelineInput {
  userId: string;
  sessionId: string;
  segments: IngestSegmentInput[];
}

export async function runIngestPipeline(input: IngestPipelineInput): Promise<{
  runId: string;
  facts: ContextFact[];
}> {
  const { userId, sessionId, segments } = input;
  const runId = await startRun(userId, 'INGEST', { sessionId, segmentCount: segments.length }, true);

  try {
    const dagResults = await runDag({ runId, userId }, [
      {
        name: 'load_known_people',
        input: () => ({ userId }),
        run: async () => {
          const user = await prisma.user.findUnique({ where: { id: userId } });
          const people = [user?.displayName, user?.caregiverName].filter(Boolean) as string[];
          return { output: { knownPeople: people } };
        },
      },
      {
        name: 'extract_facts',
        deps: ['load_known_people'],
        input: () => ({ segmentCount: segments.length }),
        run: async (results) => {
          const knownPeople = out<{ knownPeople: string[] }>(results, 'load_known_people')?.knownPeople ?? [];
          const agentOutput = await runAgent(
            'context_extractor',
            ContextExtractorOutputSchema,
            {
              segments: segments.map((s) => ({
                text: s.text,
                speaker: s.speaker,
              })),
              knownPeople,
              now: new Date().toISOString(),
            },
            { userId, sessionId, runId, node: 'extract_facts' },
          );
          return {
            output: agentOutput.facts,
            agentId: adapters().lyzr.agentId('context_extractor'),
          };
        },
      },
      {
        name: 'embed',
        deps: ['extract_facts'],
        input: (results) => ({ factCount: out<ContextFact[]>(results, 'extract_facts')?.length ?? 0 }),
        run: async (results) => {
          const facts = out<ContextFact[]>(results, 'extract_facts') ?? [];
          for (const f of facts) {
            await adapters().embedder.embed([f.text]);
          }
          return { output: { embeddedCount: facts.length } };
        },
      },
      {
        name: 'upsert_memory',
        deps: ['embed'],
        input: (results) => ({ factCount: out<ContextFact[]>(results, 'extract_facts')?.length ?? 0 }),
        run: async (results) => {
          const facts = out<ContextFact[]>(results, 'extract_facts') ?? [];
          const sourceSegmentIds = segments.map((s) => s.id).filter(Boolean) as string[];
          const upserted: any[] = [];

          for (const fact of facts) {
            const res = await upsertMemoryFact(userId, {
              ...fact,
              sourceSegmentIds,
            });
            bus.publish(
              'memory.upserted',
              userId,
              { id: res.id, fact: res.payload, merged: res.merged },
              runId,
            );
            upserted.push(res);
          }

          return { output: { upsertedCount: upserted.length, upserted } };
        },
      },
    ]);

    const facts = (dagResults.extract_facts?.output as ContextFact[]) || [];
    const isOk = dagResults.upsert_memory?.status === 'completed';
    await finishRun(runId, userId, isOk ? 'SUCCEEDED' : 'FAILED', { factsCount: facts.length });

    return { runId, facts };
  } catch (err: any) {
    logger.error({ err: err.message, runId, userId }, 'Ingest pipeline failed');
    await finishRun(runId, userId, 'FAILED', { error: err.message });
    throw err;
  }
}
