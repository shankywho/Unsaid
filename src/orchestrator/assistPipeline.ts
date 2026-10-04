import { prisma } from '../db';
import { buildConfirmQuestion, cleanConfirmedSentence } from '../lib/sentences';
import { startRun } from '../tracing/tracer';
import { runDag, out } from './dag';
import { runAgent } from '../agents/runAgent';
import {
  UtteranceClassifierOutputSchema,
  FragmentAnalystOutputSchema,
  IntentHypothesizerOutputSchema,
  type FragmentAnalystOutput,
  type HypothesisItem,
} from '../agents/schemas';
import { searchMemory, type ScoredMemoryHit } from '../memory/memoryStore';
import { searchWordMap, applySubstitutions, type ScoredWordMapHit } from '../memory/wordMap';
import {
  getPendingConfirmation,
  answerConfirmation,
  createPendingConfirmation,
} from '../confirmations/service';
import { adapters } from '../adapters';
import { bus } from '../tracing/events';
import { logger } from '../lib/logger';

export interface AssistPipelineInput {
  userId: string;
  text: string;
  sessionId?: string;
  source?: 'OMI_REALTIME' | 'SIMULATED';
}

const AFFIRMATIVE_REGEX = /^(yes|yeah|yep|haan|ha|correct|hmm yes|mm-hm|sahi|true)$/i;
const NEGATIVE_REGEX = /^(no|nope|nahi|na|galat|stop|false)$/i;

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function runAssistPipeline(input: AssistPipelineInput): Promise<{
  runId?: string;
  confirmationId?: string;
  resolved?: boolean;
  handledAsReply?: boolean;
}> {
  const { userId, text, sessionId = 'session_assist' } = input;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User ${userId} not found`);

  // Check if confirmation is pending
  const pendingConf = await getPendingConfirmation(userId);
  const trimmed = text.trim();

  // Pre-filter for quick local classification
  if (pendingConf) {
    if (AFFIRMATIVE_REGEX.test(trimmed)) {
      logger.info(
        { userId, textLength: trimmed.length },
        'Local regex classified as affirmative confirmation',
      );
      await answerConfirmation(pendingConf.id, 'yes');
      return { confirmationId: pendingConf.id, resolved: true, handledAsReply: true };
    }
    if (NEGATIVE_REGEX.test(trimmed)) {
      logger.info({ userId, textLength: trimmed.length }, 'Local regex classified as negative confirmation');
      await answerConfirmation(pendingConf.id, 'no');
      return { confirmationId: pendingConf.id, resolved: false, handledAsReply: true };
    }
  }

  // If assistMode is OFF, skip assistance
  if (user.assistMode === 'OFF') {
    logger.info({ userId }, 'AssistMode is OFF; skipping assist pipeline');
    return { resolved: false };
  }

  const contextUsed = user.contextEnabled;
  const runId = await startRun(userId, 'ASSIST', { text, contextUsed }, contextUsed);

  try {
    const dagResults = await runDag({ runId, userId }, [
      {
        name: 'classify',
        input: () => ({ text, hasPending: Boolean(pendingConf) }),
        run: async () => {
          if (user.assistMode === 'ON') {
            bus.publish(
              'segment.classified',
              userId,
              { kind: 'FRAGMENT', reason: 'assistMode ON forces fragment handling', source: 'mode_override' },
              runId,
            );
            return {
              output: { kind: 'FRAGMENT', confirmationAnswer: null },
              agentId: 'mode_override',
            };
          }

          const res = await runAgent(
            'utterance_classifier',
            UtteranceClassifierOutputSchema,
            {
              text,
              history: [],
              hasPendingConfirmation: Boolean(pendingConf),
            },
            { userId, sessionId, runId, node: 'classify' },
          );
          bus.publish(
            'segment.classified',
            userId,
            { kind: res.kind, reason: res.reason, source: 'agent' },
            runId,
          );
          return {
            output: res,
            agentId: adapters().lyzr.agentId('utterance_classifier'),
          };
        },
      },
      {
        name: 'fragment_analyze',
        // Runs in parallel with classify at DAG start
        deps: [],
        input: () => ({ text }),
        run: async () => {
          const analyst = await runAgent(
            'fragment_analyst',
            FragmentAnalystOutputSchema,
            { text },
            { userId, sessionId, runId, node: 'fragment_analyze' },
          );
          return {
            output: analyst,
            agentId: adapters().lyzr.agentId('fragment_analyst'),
          };
        },
      },
      {
        name: 'retrieve_raw_memory',
        // Starts at t=0 in parallel with classify and fragment_analyze
        deps: [],
        skip: () => (!contextUsed ? 'context disabled' : null),
        input: () => ({ fragment: text }),
        run: async () => {
          const hits = await searchMemory(userId, [text], 8);
          const retrieval = hits.map((h) => ({
            id: h.id,
            type: h.type,
            text: h.text,
            score: Number(h.score.toFixed(3)),
          }));
          return { output: hits, retrieval };
        },
      },
      {
        name: 'retrieve_memory',
        deps: ['retrieve_raw_memory', 'fragment_analyze'],
        skip: () => (!contextUsed ? 'context disabled' : null),
        input: (results) => {
          const analyst = out<FragmentAnalystOutput>(results, 'fragment_analyze');
          return {
            rawHitsCount: out<ScoredMemoryHit[]>(results, 'retrieve_raw_memory')?.length ?? 0,
            queries: analyst?.retrievalQueries ?? [],
          };
        },
        run: async (results) => {
          const analyst = out<FragmentAnalystOutput>(results, 'fragment_analyze');
          const rawHits = out<ScoredMemoryHit[]>(results, 'retrieve_raw_memory') ?? [];
          const extraQueries = (analyst?.retrievalQueries ?? []).filter(
            (q) => q && q.trim().toLowerCase() !== text.trim().toLowerCase(),
          );

          let extraHits: ScoredMemoryHit[] = [];
          if (extraQueries.length > 0) {
            extraHits = await searchMemory(userId, extraQueries, 8);
          }

          // Merge and deduplicate by point ID, keeping highest score
          const mergedMap = new Map<string, ScoredMemoryHit>();
          for (const hit of [...rawHits, ...extraHits]) {
            const existing = mergedMap.get(hit.id);
            if (!existing || hit.score > existing.score) {
              mergedMap.set(hit.id, hit);
            }
          }

          const hits = Array.from(mergedMap.values()).sort((a, b) => b.score - a.score);
          const retrieval = hits.map((h) => ({
            id: h.id,
            type: h.type,
            text: h.text,
            score: Number(h.score.toFixed(3)),
          }));
          return { output: hits, retrieval };
        },
      },
      {
        name: 'retrieve_wordmap',
        // Runs in parallel at DAG start
        deps: [],
        skip: () => (!contextUsed ? 'context disabled' : null),
        input: () => ({ fragment: text }),
        run: async () => {
          const hits = await searchWordMap(userId, text);
          const retrieval = hits.map((h) => ({
            id: h.id,
            kind: h.kind,
            resolvedSentence: h.resolvedSentence,
            score: Number(h.score.toFixed(3)),
          }));
          return { output: hits, retrieval };
        },
      },
      {
        name: 'hypothesize',
        deps: ['classify', 'retrieve_memory', 'retrieve_wordmap'],
        allowFailedDeps: true,
        skip: (results) => {
          const cls = out<{ kind: string }>(results, 'classify');
          if (cls && cls.kind !== 'FRAGMENT') {
            return `classified as ${cls.kind}`;
          }
          return null;
        },
        input: (results) => ({
          fragment: text,
          memoryCount: out<ScoredMemoryHit[]>(results, 'retrieve_memory')?.length ?? 0,
          wordMapCount: out<ScoredWordMapHit[]>(results, 'retrieve_wordmap')?.length ?? 0,
        }),
        run: async (results) => {
          const analyst = out<FragmentAnalystOutput>(results, 'fragment_analyze') ?? {
            keywords: [],
            entities: [],
            speechActGuess: 'request',
            negation: false,
            possibleSubstitutions: [],
            retrievalQueries: [],
          };
          const memoryHits = out<ScoredMemoryHit[]>(results, 'retrieve_memory') ?? [];
          const wordMapHits = out<ScoredWordMapHit[]>(results, 'retrieve_wordmap') ?? [];

          // Extract substitutions and produce normalized fragment (REPLACE said with meant, never combine)
          const substitutions = wordMapHits
            .filter((h) => h.said && h.meant)
            .map((h) => ({ said: h.said!, meant: h.meant! }));
          const normalizedFragment =
            substitutions.length > 0 ? applySubstitutions(text, substitutions) : text;

          const payload = {
            fragment: text,
            normalizedFragment,
            substitutionsRule:
              'A substitution means REPLACE the said word with the meant word. NEVER combine both together.',
            analyst,
            memoryFacts: memoryHits.map((h) => ({
              id: h.id,
              type: h.type,
              text: h.text,
              score: h.score,
            })),
            wordMapHits,
            now: new Date().toISOString(),
          };

          let agentRes = await runAgent('intent_hypothesizer', IntentHypothesizerOutputSchema, payload, {
            userId,
            sessionId,
            runId,
            node: 'hypothesize',
          });

          // Diversity Enforcement: Reject and regenerate if any 2 hypotheses have embedding similarity > 0.9
          if (agentRes.hypotheses.length >= 2) {
            try {
              const texts = agentRes.hypotheses.map((h) => `${h.intent}: ${h.sentence}`);
              const vectors = await adapters().embedder.embed(texts);
              let tooSimilar = false;
              let maxSim = 0;

              for (let i = 0; i < vectors.length; i++) {
                for (let j = i + 1; j < vectors.length; j++) {
                  const sim = cosineSimilarity(vectors[i], vectors[j]);
                  if (sim > maxSim) maxSim = sim;
                  if (sim > 0.9) {
                    tooSimilar = true;
                    break;
                  }
                }
                if (tooSimilar) break;
              }

              if (tooSimilar) {
                logger.warn(
                  { maxSimilarity: Number(maxSim.toFixed(3)), count: agentRes.hypotheses.length },
                  'Hypotheses lacked diversity (similarity > 0.9); regenerating distinct alternatives',
                );

                const regenerated = await runAgent(
                  'intent_hypothesizer',
                  IntentHypothesizerOutputSchema,
                  {
                    ...payload,
                    diversityInstruction:
                      'DIVERSITY REJECTION: Previous hypotheses had embedding similarity > 0.90. You MUST produce 3 clearly distinct hypotheses with different candidate intents. Each question must preserve its hypothesis intent exactly.',
                  },
                  { userId, sessionId, runId, node: 'hypothesize' },
                );

                if (regenerated.hypotheses.length > 0) {
                  agentRes = regenerated;
                }
              }
            } catch (embedErr: any) {
              logger.warn({ err: embedErr.message }, 'Diversity embedding check skipped due to error');
            }
          }

          // Preserve exact hypothesis intent in question
          for (const h of agentRes.hypotheses) {
            if (!h.speaker_perspective_question || h.speaker_perspective_question.trim().length === 0) {
              h.speaker_perspective_question = `Do you mean: "${h.sentence}"?`;
            }
          }

          // Code-side sanitization: only keep valid evidence IDs
          const validMemoryIds = new Set(memoryHits.map((m) => m.id));
          const sanitizedHypotheses = agentRes.hypotheses.map((h) => ({
            ...h,
            evidenceIds: (h.evidenceIds || []).filter((id) => validMemoryIds.has(id)),
          }));

          // Fallback if 0 valid hypotheses
          if (sanitizedHypotheses.length === 0) {
            sanitizedHypotheses.push({
              intent: `Help with ${text}`,
              sentence: `I need assistance with ${text}.`,
              speaker_perspective_question: 'Is this about a person, a place, or something you need?',
              confidence: 0.5,
              evidenceIds: [],
              reasoning: 'Fallback hypothesis',
            });
          }

          bus.publish(
            'hypotheses.generated',
            userId,
            {
              normalizedFragment,
              hypotheses: sanitizedHypotheses.map((h, rank) => ({
                rank,
                intent: h.intent,
                sentence: h.sentence,
                question: h.speaker_perspective_question,
                confidence: h.confidence,
                evidenceIds: h.evidenceIds,
              })),
            },
            runId,
          );
          return {
            output: sanitizedHypotheses,
            agentId: adapters().lyzr.agentId('intent_hypothesizer'),
          };
        },
      },
      {
        name: 'compose_question',
        deps: ['hypothesize'],
        run: async (results) => {
          const hypotheses = out<HypothesisItem[]>(results, 'hypothesize') ?? [];
          const top = hypotheses[0];
          return {
            output: {
              question: buildConfirmQuestion({
                question: top.speaker_perspective_question,
                sentence: top.sentence,
              }),
              finalSentence: cleanConfirmedSentence(top.sentence) ?? top.sentence,
            },
          };
        },
      },
      {
        name: 'tts_question',
        deps: ['compose_question'],
        run: async (results) => {
          const composed = out<{ question: string }>(results, 'compose_question');
          const q = composed?.question || 'Do you need help?';
          const ttsRes = await adapters().tts.synthesize(q);
          return { output: { audioId: ttsRes.id } };
        },
      },
      {
        name: 'await_confirmation',
        deps: ['tts_question'],
        run: async (results) => {
          const hypotheses = out<HypothesisItem[]>(results, 'hypothesize') ?? [];
          const composed = out<{ question: string }>(results, 'compose_question');
          const ttsRes = out<{ audioId: string }>(results, 'tts_question');

          const conf = await createPendingConfirmation({
            userId,
            runId,
            fragment: text,
            hypotheses,
            question: composed?.question || 'Do you mean this?',
            questionAudio: ttsRes?.audioId,
          });

          return { output: { confirmationId: conf.id } };
        },
      },
    ]);

    const confId = (dagResults.await_confirmation?.output as any)?.confirmationId;
    return { runId, confirmationId: confId, resolved: false };
  } catch (err: any) {
    logger.error({ err: err.message, runId, userId }, 'Assist pipeline failed');
    throw err;
  }
}
