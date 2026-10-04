import { startRun, finishRun } from '../tracing/tracer';
import { runDag, out } from './dag';
import { runAgent } from '../agents/runAgent';
import { LearnerOutputSchema, type LearnerOutput } from '../agents/schemas';
import { upsertResolvedUtterance, upsertSubstitution, isTrueSubstitution } from '../memory/wordMap';
import { bus } from '../tracing/events';
import { adapters } from '../adapters';
import { logger } from '../lib/logger';

export interface LearnPipelineInput {
  userId: string;
  fragment: string;
  confirmedSentence?: string;
  rejectedHypotheses?: string[];
  runId?: string;
}

export async function runLearnPipeline(input: LearnPipelineInput): Promise<{ runId: string }> {
  const { userId, fragment, confirmedSentence, rejectedHypotheses = [] } = input;
  const runId = await startRun(userId, 'LEARN', { fragment, confirmedSentence, rejectedHypotheses }, true);

  try {
    const dagResults = await runDag({ runId, userId }, [
      {
        name: 'learner',
        input: () => ({ fragment, confirmedSentence }),
        run: async () => {
          const agentOutput = await runAgent(
            'learner',
            LearnerOutputSchema,
            {
              fragment,
              confirmedSentence: confirmedSentence || '',
              rejectedHypotheses,
              analyst: {},
            },
            { userId, runId, node: 'learner' },
          );
          return {
            output: agentOutput,
            agentId: adapters().lyzr.agentId('learner'),
          };
        },
      },
      {
        name: 'upsert_wordmap',
        deps: ['learner'],
        input: (results) => ({ learned: out<LearnerOutput>(results, 'learner') }),
        run: async (results) => {
          const learned = out<LearnerOutput>(results, 'learner');

          // 1. If we have a confirmed sentence, save the resolved utterance pattern
          if (confirmedSentence) {
            await upsertResolvedUtterance(userId, fragment, confirmedSentence);
          }

          // 2. Save any learned substitutions (only when the learner classified relation=SUBSTITUTION)
          if (learned?.substitutions) {
            for (const sub of learned.substitutions) {
              if (isTrueSubstitution(sub)) {
                await upsertSubstitution(userId, sub.said, sub.meant, 'SUBSTITUTION');
              } else {
                logger.info(
                  { userId, said: sub.said, meant: sub.meant, relation: sub.relation },
                  'Not stored: relation is not SUBSTITUTION',
                );
              }
            }
          }

          // 3. Save any learned name aliases
          if (learned?.nameAliases) {
            for (const alias of learned.nameAliases) {
              await upsertSubstitution(userId, alias.said, alias.meant, 'NAME_ALIAS');
            }
          }

          bus.publish(
            'wordmap.updated',
            userId,
            {
              fragment,
              confirmedSentence,
              substitutions: learned?.substitutions ?? [],
              nameAliases: learned?.nameAliases ?? [],
              summary: learned?.summary,
            },
            runId,
          );

          return { output: { success: true } };
        },
      },
    ]);

    const isOk = dagResults.upsert_wordmap?.status === 'completed';
    await finishRun(runId, userId, isOk ? 'SUCCEEDED' : 'FAILED', {
      success: isOk,
    });
    return { runId };
  } catch (err: any) {
    logger.error({ err: err.message, runId, userId }, 'Learn pipeline failed');
    await finishRun(runId, userId, 'FAILED', { error: err.message });
    throw err;
  }
}
