import { useEffect, useReducer, useRef, useState } from 'react';
import type { EventEnvelope } from '../api/client';
import evalReport from '../generated/eval.json';
import persona from '../generated/persona.json';
import {
  initialLive,
  liveReducer,
  type FeedItem,
  type LiveAction,
  type LiveState,
} from '../console/liveState';

/** The seeded demo patient, read from the persona fixture at build time. */
export const DEMO_PATIENT: string = persona.patientName;

const stats = (
  evalReport as { results: Array<{ mode: string; stepStats: Record<string, { p50Ms: number }> }> }
).results.find((r) => r.mode === 'context ON')!.stepStats;
const p50 = (n: string) => stats[n]?.p50Ms ?? 0;

const RUN = 'demo-run';
const ev = (
  type: EventEnvelope['type'],
  data: Record<string, unknown>,
  runId: string | undefined = RUN,
): LiveAction => ({
  type: 'event',
  e: { type, userId: 'demo', runId, ts: new Date(Date.now()).toISOString(), data } as EventEnvelope,
});

export const AMBIENT: FeedItem[] = [
  {
    kind: 'segment',
    id: 'a1',
    text: 'The bakery lady called. I will bake on Saturday as usual.',
    speaker: 'Sunita',
    isUser: false,
    source: 'OMI_REALTIME',
    ts: '2026-10-04T10:38:41',
  },
  {
    kind: 'segment',
    id: 'a2',
    text: 'Should I bring something on Sunday? I can stop at the market.',
    speaker: 'Priya',
    isUser: false,
    source: 'OMI_REALTIME',
    ts: '2026-10-04T10:38:55',
  },
  {
    kind: 'segment',
    id: 'a3',
    text: 'Ask your father. He has opinions.',
    speaker: 'Sunita',
    isUser: false,
    source: 'OMI_REALTIME',
    ts: '2026-10-04T10:39:10',
  },
];

export const HITS = [
  { id: 'f1', type: 'event', text: 'Priya (daughter) is visiting on Sunday morning from Pune', score: 0.71 },
  {
    id: 'f2',
    type: 'health_instruction',
    text: 'Dr. Mehta said Papa must strictly avoid sugar, sweets and pastries',
    score: 0.64,
  },
  { id: 'f3', type: 'routine', text: 'Sunita bakes on Saturdays', score: 0.38 },
];
const SVC = {
  classify: { provider: 'lyzr', name: 'utterance_classifier' },
  fragment_analyze: { provider: 'lyzr', name: 'fragment_analyst' },
  retrieve_raw_memory: { provider: 'qdrant', name: 'unsaid_memory' },
  retrieve_wordmap: { provider: 'qdrant', name: 'unsaid_wordmap' },
  retrieve_memory: { provider: 'qdrant', name: 'unsaid_memory' },
  hypothesize: { provider: 'lyzr', name: 'intent_hypothesizer' },
  compose_question: { provider: 'local', name: 'compose_question' },
  tts_question: { provider: 'tts', name: 'speech' },
  await_confirmation: { provider: 'redis', name: 'pending-confirmation' },
} as const;

/**
 * Scripted ASSIST run. Every latency is the median from the latest live eval; offsets are derived from the DAG
 * (the four parallel steps start together, the rest follow), so nothing here is a typed timing.
 */
const T0 = 700; // ms between the fragment and run.started
const par = ['classify', 'fragment_analyze', 'retrieve_raw_memory', 'retrieve_wordmap'] as const;
const seq = [
  'retrieve_memory',
  'hypothesize',
  'compose_question',
  'tts_question',
  'await_confirmation',
] as const;
const offsets: Record<string, number> = {};
let cursor = Math.max(...par.map((n) => p50(n)));
for (const n of par) offsets[n] = 0;
for (const n of seq) {
  offsets[n] = cursor;
  cursor += p50(n);
}
const at = (n: string, end = false) => T0 + (offsets[n] ?? 0) + (end ? p50(n) : 0);
const stepStart = (n: string): [number, LiveAction] => [
  at(n),
  ev('step.started', { node: n, startOffsetMs: offsets[n], service: SVC[n as keyof typeof SVC] }),
];
const stepDone = (n: string, extra: Record<string, unknown> = {}): [number, LiveAction] => [
  at(n, true),
  ev('step.completed', {
    node: n,
    latencyMs: p50(n),
    startOffsetMs: offsets[n],
    service: SVC[n as keyof typeof SVC],
    status: 'COMPLETED',
    ...extra,
  }),
];

export const HYPS = [
  {
    rank: 0,
    intent: 'Tell Priya not to bring cake',
    sentence: 'Please tell Priya not to bring cake on Sunday.',
    question: 'Do you want to tell Priya not to bring cake on Sunday?',
    confidence: 0.62,
    evidenceIds: ['f1', 'f2'],
  },
  {
    rank: 1,
    intent: 'Ask about the cake',
    sentence: 'Is Priya bringing cake on Sunday?',
    question: 'Are you asking if Priya is bringing cake?',
    confidence: 0.24,
    evidenceIds: ['f1'],
  },
  {
    rank: 2,
    intent: 'No baking this weekend',
    sentence: 'We should not bake a cake for Sunday.',
    question: 'Do you mean we should not bake a cake?',
    confidence: 0.14,
    evidenceIds: ['f3'],
  },
];

const asked = at('await_confirmation');
export const PRESS_AT = asked + 1800;
const RESOLVED_AT = PRESS_AT + 500;
export const LOOP_MS = RESOLVED_AT + 5200;

export const SCRIPT: Array<[number, LiveAction]> = [
  [0, { type: 'seed_feed', items: AMBIENT }],
  [
    200,
    { type: 'local_fragment', text: 'Sunday… Priya… cake… no', id: 'demo-seg', ts: '2026-10-04T10:39:26' },
  ],
  [T0, ev('run.started', { pipeline: 'ASSIST', contextUsed: true })],
  ...par.map(stepStart),
  [
    at('classify', true),
    ev('segment.classified', {
      kind: 'FRAGMENT',
      reason: 'telegraphic speech with a negation',
      source: 'agent',
    }),
  ],
  ...par.map((n) =>
    stepDone(
      n,
      n === 'retrieve_raw_memory' ? { retrieval: HITS } : n === 'retrieve_wordmap' ? { retrieval: [] } : {},
    ),
  ),
  stepStart('retrieve_memory'),
  stepDone('retrieve_memory', { retrieval: HITS }),
  stepStart('hypothesize'),
  [at('hypothesize', true), ev('hypotheses.generated', { hypotheses: HYPS })],
  stepDone('hypothesize'),
  stepStart('compose_question'),
  stepDone('compose_question'),
  stepStart('tts_question'),
  stepDone('tts_question'),
  stepStart('await_confirmation'),
  [
    asked,
    ev('confirmation.asked', {
      confirmationId: 'demo-conf',
      question: HYPS[0].question,
      currentIndex: 0,
      hypothesesCount: 3,
    }),
  ],
  stepDone('await_confirmation'),
  [RESOLVED_AT, ev('assist.resolved', { confirmationId: 'demo-conf', finalSentence: HYPS[0].sentence })],
  [RESOLVED_AT + 300, ev('run.started', { pipeline: 'LEARN', contextUsed: false }, 'demo-learn')],
  [
    RESOLVED_AT + 900,
    ev('wordmap.updated', { fragment: 'Sunday… Priya… cake… no', summary: 'word map updated' }, 'demo-learn'),
  ],
];

/** Final frame: shown on first paint and to anyone who prefers reduced motion. */
const stamp = (a: LiveAction, ms: number): LiveAction =>
  a.type === 'event' ? { ...a, e: { ...a.e, ts: new Date(ms).toISOString() } } : a;

export function finalState(): LiveState {
  return SCRIPT.reduce((acc, [t, a]) => liveReducer(acc, stamp(a, 1_700_000_000_000 + t)), initialLive);
}

export function useScriptedDemo(): { state: LiveState; pressed: boolean } {
  const [state, dispatch] = useReducer(liveReducer, undefined, finalState);
  const [pressed, setPressed] = useState(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !window.matchMedia('(prefers-reduced-motion: no-preference)').matches
    )
      return;
    const clear = () => timers.current.forEach(clearTimeout);
    const run = () => {
      dispatch({ type: 'reset' });
      setPressed(false);
      for (const [t, a] of SCRIPT) {
        timers.current.push(setTimeout(() => dispatch(stamp(a, Date.now())), t));
      }
      timers.current.push(setTimeout(() => setPressed(true), PRESS_AT));
      timers.current.push(setTimeout(run, LOOP_MS));
    };
    // let the static confirmed frame sit for a beat, then start the loop
    timers.current.push(setTimeout(run, 4000));
    return clear;
  }, []);

  return { state, pressed };
}
