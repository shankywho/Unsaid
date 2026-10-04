import type { EventEnvelope, RunDetail } from '../api/client';

export interface Service {
  provider: 'lyzr' | 'qdrant' | 'openai' | 'tts' | 'redis' | 'local';
  name: string;
}

/** Canonical ASSIST DAG. The first four start together; the rest follow in order. */
export const PARALLEL = ['classify', 'fragment_analyze', 'retrieve_raw_memory', 'retrieve_wordmap'] as const;
export const SEQUENTIAL = [
  'retrieve_memory',
  'hypothesize',
  'compose_question',
  'tts_question',
  'await_confirmation',
] as const;
export const NODES = [
  { id: 'classify', label: 'Classify', hint: 'Is this a fragment?' },
  { id: 'fragment_analyze', label: 'Analyze fragment', hint: 'Names, actions, negation' },
  { id: 'retrieve_raw_memory', label: 'Raw memory', hint: 'What was overheard' },
  { id: 'retrieve_wordmap', label: 'Word map', hint: 'Learned words' },
  { id: 'retrieve_memory', label: 'Retrieve memory', hint: 'Facts that match' },
  { id: 'hypothesize', label: 'Hypothesize', hint: 'Ranked meanings' },
  { id: 'compose_question', label: 'Compose question', hint: 'One yes/no question' },
  { id: 'tts_question', label: 'Speak question', hint: 'Text to speech' },
  { id: 'await_confirmation', label: 'Await answer', hint: 'Waiting for yes or no' },
] as const;
export const NODE_IDS: string[] = NODES.map((n) => n.id);
export const nodeLabel = (id: string): string => NODES.find((n) => n.id === id)?.label ?? id;
export const nodeHint = (id: string): string => NODES.find((n) => n.id === id)?.hint ?? '';

export interface Hit {
  id: string;
  type?: string;
  text: string;
  score: number;
}
export interface StepView {
  node: string;
  status: 'running' | 'done' | 'failed' | 'skipped';
  latencyMs?: number;
  /** ms from run start, so parallel steps share one timeline */
  startOffsetMs?: number;
  service?: Service;
  retrieval?: Hit[];
  preview?: string;
  error?: string;
}
export interface HypView {
  rank: number;
  intent: string;
  sentence: string;
  question: string;
  confidence: number;
  evidenceIds: string[];
}
export type ConfStatus = 'pending' | 'resolved' | 'unresolved' | 'expired';
export interface ConfView {
  id: string;
  question: string;
  audioUrl?: string;
  index: number;
  count: number;
  status: ConfStatus;
  reason?: string;
  finalSentence?: string;
  finalAudioUrl?: string;
  fallbackQuestion?: string;
  askedAt?: string;
  /** ms between the question and the answer, from the two event timestamps */
  answeredMs?: number;
}
export interface LearnView {
  status: 'queued' | 'running' | 'done';
  summary?: string;
}
export type FeedItem =
  | {
      kind: 'segment';
      id: string;
      text: string;
      speaker?: string | null;
      isUser: boolean;
      source?: string;
      ts: string;
    }
  | { kind: 'note'; id: string; text: string; ts: string };

export interface LiveState {
  feed: FeedItem[];
  runId?: string;
  fragment?: string;
  classified?: { kind: string; reason: string };
  steps: StepView[];
  hypotheses: HypView[];
  conf?: ConfView;
  learn?: LearnView;
  startedAt?: number;
  thinking: boolean;
}

export const initialLive: LiveState = { feed: [], steps: [], hypotheses: [], thinking: false };

export type LiveAction =
  | { type: 'event'; e: EventEnvelope }
  | { type: 'local_fragment'; text: string; id: string; ts: string }
  | { type: 'seed_feed'; items: FeedItem[] }
  | { type: 'reset' };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

function upsertStep(steps: StepView[], next: StepView): StepView[] {
  const i = steps.findIndex((s) => s.node === next.node);
  if (i === -1) return [...steps, next];
  const copy = steps.slice();
  copy[i] = { ...copy[i], ...next };
  return copy;
}

export function toService(raw: unknown): Service | undefined {
  const r = rec(raw);
  return typeof r.provider === 'string' && typeof r.name === 'string' ? (r as unknown as Service) : undefined;
}

export function toHits(raw: unknown): Hit[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map((h) => rec(h))
    .filter((h) => typeof h.id === 'string')
    .map((h) => ({
      id: str(h.id),
      type: str(h.type) || str(h.kind) || undefined,
      text: str(h.text) || str(h.resolvedSentence),
      score: num(h.score) ?? 0,
    }));
}

export function liveReducer(state: LiveState, action: LiveAction): LiveState {
  switch (action.type) {
    case 'reset':
      return initialLive;
    case 'seed_feed':
      return { ...state, feed: action.items };
    case 'local_fragment':
      return {
        ...state,
        feed: state.feed.some((f) => f.id === action.id)
          ? state.feed
          : [
              ...state.feed,
              {
                kind: 'segment',
                id: action.id,
                text: action.text,
                speaker: 'Patient',
                isUser: true,
                source: 'SIMULATED',
                ts: action.ts,
              },
            ],
        fragment: action.text,
        thinking: true,
        steps: [],
        hypotheses: [],
        conf: undefined,
        classified: undefined,
        runId: undefined,
        startedAt: Date.now(),
      };
    case 'event':
      return applyEvent(state, action.e);
  }
}

function applyEvent(s: LiveState, e: EventEnvelope): LiveState {
  const d = rec(e.data);
  switch (e.type) {
    case 'segment.received': {
      const id = str(d.segmentId) || `${e.ts}-${str(d.text).slice(0, 8)}`;
      if (s.feed.some((f) => f.id === id)) return s;
      const isUser = d.isUser === true;
      return {
        ...s,
        feed: [
          ...s.feed,
          {
            kind: 'segment',
            id,
            text: str(d.text),
            speaker: isUser ? 'Patient' : 'Household',
            isUser,
            source: str(d.source),
            ts: e.ts,
          },
        ],
        fragment: isUser ? str(d.text) : s.fragment,
      };
    }
    case 'run.started':
      if (d.pipeline === 'LEARN') {
        return s.learn?.status === 'queued' ? { ...s, learn: { status: 'running' } } : s;
      }
      if (d.pipeline !== 'ASSIST') return s;
      return {
        ...s,
        runId: e.runId,
        steps: [],
        hypotheses: [],
        conf: undefined,
        learn: undefined,
        classified: undefined,
        thinking: true,
        startedAt: Date.now(),
      };
    case 'memory.upserted': {
      const fact = rec(d.fact);
      return {
        ...s,
        feed: [
          ...s.feed,
          {
            kind: 'note',
            id: `m-${str(d.id)}-${e.ts}`,
            text: `${d.merged ? 'Updated memory' : 'Remembered'}: ${str(fact.text)}`,
            ts: e.ts,
          },
        ],
      };
    }
    case 'wordmap.updated': {
      const subs = Array.isArray(d.substitutions) ? d.substitutions.map(rec) : [];
      const aliases = Array.isArray(d.nameAliases) ? d.nameAliases.map(rec) : [];
      const pairs = [...subs, ...aliases].map((x) => `“${str(x.said)}” means “${str(x.meant)}”`);
      return {
        ...s,
        learn: s.learn ? { status: 'done', summary: str(d.summary) || undefined } : s.learn,
        feed: [
          ...s.feed,
          {
            kind: 'note',
            id: `w-${e.ts}`,
            text: pairs.length
              ? `Learned: ${pairs.join(', ')}`
              : 'Saved this confirmed sentence for next time',
            ts: e.ts,
          },
        ],
      };
    }
    default:
      break;
  }
  // everything below belongs to the active ASSIST run
  if (!e.runId || !s.runId || e.runId !== s.runId) return s;
  switch (e.type) {
    case 'step.started':
      return {
        ...s,
        steps: upsertStep(s.steps, {
          node: str(d.node),
          status: 'running',
          startOffsetMs: num(d.startOffsetMs),
          service: toService(d.service),
        }),
      };
    case 'step.completed':
    case 'step.failed': {
      const status = e.type === 'step.failed' ? 'failed' : d.status === 'SKIPPED' ? 'skipped' : 'done';
      return {
        ...s,
        steps: upsertStep(s.steps, {
          node: str(d.node),
          status,
          latencyMs: num(d.latencyMs),
          startOffsetMs: num(d.startOffsetMs),
          service: toService(d.service),
          retrieval: toHits(d.retrieval),
          preview: str(d.outputPreview) || undefined,
          error: str(d.error) || undefined,
        }),
      };
    }
    case 'segment.classified':
      return { ...s, classified: { kind: str(d.kind), reason: str(d.reason) } };
    case 'hypotheses.generated': {
      const list = Array.isArray(d.hypotheses) ? d.hypotheses.map(rec) : [];
      return {
        ...s,
        hypotheses: list.map((h, i) => ({
          rank: num(h.rank) ?? i,
          intent: str(h.intent),
          sentence: str(h.sentence),
          question: str(h.question),
          confidence: num(h.confidence) ?? 0,
          evidenceIds: Array.isArray(h.evidenceIds) ? h.evidenceIds.map(String) : [],
        })),
      };
    }
    case 'confirmation.asked':
      return {
        ...s,
        thinking: false,
        conf: {
          id: str(d.confirmationId),
          question: str(d.question),
          audioUrl: str(d.audioUrl) || undefined,
          index: num(d.currentIndex) ?? 0,
          count: num(d.hypothesesCount) ?? 3,
          status: 'pending',
          askedAt: e.ts,
        },
      };
    case 'assist.resolved':
      return {
        ...s,
        thinking: false,
        conf: s.conf && {
          ...s.conf,
          status: 'resolved',
          finalSentence: str(d.finalSentence),
          finalAudioUrl: str(d.audioUrl) || undefined,
          answeredMs: s.conf.askedAt ? Math.max(0, Date.parse(e.ts) - Date.parse(s.conf.askedAt)) : undefined,
        },
        learn: { status: 'queued' },
      };
    case 'assist.unresolved':
      return {
        ...s,
        thinking: false,
        conf: s.conf && { ...s.conf, status: 'unresolved', fallbackQuestion: str(d.fallbackQuestion) },
      };
    case 'confirmation.expired':
      return {
        ...s,
        thinking: false,
        conf: s.conf && { ...s.conf, status: 'expired', reason: str(d.reason) },
      };
    case 'run.completed':
      // ASSIST runs only complete this way when they fail before a confirmation exists
      return s.conf ? s : { ...s, thinking: false };
    default:
      return s;
  }
}

/* ---------- derived helpers ---------- */

export type SpeechAct = 'ask' | 'request' | 'inform';
/** Client-side label: the API does not return a speech act per hypothesis, so we read it off the sentence. */
export function speechAct(sentence: string): SpeechAct {
  const t = sentence.trim();
  if (
    t.endsWith('?') ||
    /^(did|does|do|is|are|was|were|when|where|what|who|how|can|could|will|would)\b/i.test(t)
  )
    return 'ask';
  if (/^(please|remind|tell|ask|bring|call|turn|give|help|check|let)\b/i.test(t)) return 'request';
  return 'inform';
}

/** Steps in canonical order; unknown nodes last. */
export const orderedSteps = (steps: StepView[]): StepView[] =>
  steps.slice().sort((a, b) => {
    const ia = NODE_IDS.indexOf(a.node);
    const ib = NODE_IDS.indexOf(b.node);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

/** Why a step was skipped, read from the step's output (`{ skipped: reason }`). */
export function skipReason(step: StepView): string | undefined {
  if (step.status !== 'skipped') return undefined;
  try {
    const v = JSON.parse(step.preview ?? '{}') as { skipped?: string };
    return v.skipped;
  } catch {
    return undefined;
  }
}

export const memoryHits = (steps: StepView[]): Hit[] =>
  steps.find((s) => s.node === 'retrieve_memory')?.retrieval ??
  steps.find((s) => s.node === 'retrieve_raw_memory')?.retrieval ??
  [];

/** Static trace (Runs screen) -> the same view model the live stepper uses. */
export function fromRun(run: RunDetail): { steps: StepView[]; hypotheses: HypView[]; fragment?: string } {
  const steps: StepView[] = run.steps.map((st) => ({
    node: st.node,
    status:
      st.status === 'FAILED'
        ? 'failed'
        : st.status === 'SKIPPED'
          ? 'skipped'
          : st.status === 'RUNNING'
            ? 'running'
            : 'done',
    latencyMs: st.latencyMs ?? undefined,
    preview: st.status === 'SKIPPED' && st.output ? JSON.stringify(st.output) : undefined,
    startOffsetMs: st.startOffsetMs,
    service: st.service,
    retrieval: toHits(st.retrieval),
    error: st.error ?? undefined,
  }));
  const hy = run.steps.find((x) => x.node === 'hypothesize')?.output;
  const hypotheses: HypView[] = Array.isArray(hy)
    ? hy.map(rec).map((h, i) => ({
        rank: i,
        intent: str(h.intent),
        sentence: str(h.sentence),
        question: str(h.speaker_perspective_question),
        confidence: num(h.confidence) ?? 0,
        evidenceIds: Array.isArray(h.evidenceIds) ? h.evidenceIds.map(String) : [],
      }))
    : [];
  const input = rec(run.input);
  return { steps, hypotheses, fragment: str(input.text) || undefined };
}
