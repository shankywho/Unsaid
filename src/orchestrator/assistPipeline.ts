import { prisma } from '../db';
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
import { searchWordMap, type ScoredWordMapHit } from '../memory/wordMap';
import {
  getPendingConfirmation,
  answerConfirmation,
  createPendingConfirmation,
} from '../confirmations/service';
import { adapters } from '../adapters';
import { logger } from '../lib/logger';

export interface AssistPipelineInput {
  userId: string;
  text: string;
  sessionId?: string;
  source?: 'OMI_REALTIME' | 'SIMULATED';
}

const AFFIRMATIVE_REGEX = /^(yes|yeah|yep|haan|ha|correct|hmm yes|mm-hm|sahi|true)$/i;
const NEGATIVE_REGEX = /^(no|nope|nahi|na|galat|stop|false)$/i;

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
      logger.info({ userId, text: trimmed }, 'Local regex classified as affirmative confirmation');
      await answerConfirmation(pendingConf.id, 'yes');
      return { confirmationId: pendingConf.id, resolved: true, handledAsReply: true };
    }
    if (NEGATIVE_REGEX.test(trimmed)) {
      logger.info({ userId, text: trimmed }, 'Local regex classified as negative confirmation');
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
          return {
            output: res,
            agentId: adapters().lyzr.agentId('utterance_classifier'),
          };
        },
      },
      {
        name: 'fragment_analyze',
        deps: ['classify'],
        skip: (results) => {
          const cls = out<{ kind: string }>(results, 'classify');
          return cls?.kind !== 'FRAGMENT' ? `classified as ${cls?.kind ?? 'unknown'}` : null;
        },
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
        name: 'retrieve_memory',
        deps: ['fragment_analyze'],
        skip: () => (!contextUsed ? 'context disabled' : null),
        input: (results) => {
          const analyst = out<FragmentAnalystOutput>(results, 'fragment_analyze');
          return { queries: [text, ...(analyst?.retrievalQueries ?? [])] };
        },
        run: async (results) => {
          const analyst = out<FragmentAnalystOutput>(results, 'fragment_analyze');
          const queries = [text, ...(analyst?.retrievalQueries ?? [])];
          const hits = await searchMemory(userId, queries);
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
        deps: ['fragment_analyze'],
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
        deps: ['retrieve_memory', 'retrieve_wordmap'],
        allowFailedDeps: true,
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

          const agentRes = await runAgent(
            'intent_hypothesizer',
            IntentHypothesizerOutputSchema,
            {
              fragment: text,
              analyst,
              memoryFacts: memoryHits.map((h) => ({
                id: h.id,
                type: h.type,
                text: h.text,
                score: h.score,
              })),
              wordMapHits,
              now: new Date().toISOString(),
            },
            { userId, sessionId, runId, node: 'hypothesize' },
          );

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
              question: top.speaker_perspective_question,
              finalSentence: top.sentence,
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
