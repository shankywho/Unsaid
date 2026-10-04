import { useEffect, useReducer, useRef, useState } from 'react';
import type { EventEnvelope } from '../api/client';
import evalReport from '../generated/eval.json';
import { initialLive, liveReducer, type LiveAction, type LiveState } from '../console/liveState';

const stats = (
  evalReport as { results: Array<{ mode: string; stepStats: Record<string, { p50Ms: number }> }> }
).results.find((r) => r.mode === 'context ON')!.stepStats;
const p50 = (n: string, fallback: number) => stats[n]?.p50Ms ?? fallback;

const RUN = 'demo-run';
const ev = (
  type: EventEnvelope['type'],
  data: Record<string, unknown>,
  runId: string | undefined = RUN,
): LiveAction => ({
  type: 'event',
  e: { type, userId: 'demo', runId, ts: new Date().toISOString(), data } as EventEnvelope,
});
const started = (node: string) => ev('step.started', { node });
const done = (node: string, latencyMs: number, extra: Record<string, unknown> = {}) =>
  ev('step.completed', { node, latencyMs, status: 'COMPLETED', ...extra });

const HITS = [
  { id: 'f1', type: 'event', text: 'Priya (daughter) is visiting on Sunday morning from Pune', score: 0.71 },
  {
    id: 'f2',
    type: 'health_instruction',
    text: 'Dr. Mehta said Papa must strictly avoid sugar, sweets and pastries',
    score: 0.64,
  },
  { id: 'f3', type: 'routine', text: 'Sunita bakes on Saturdays', score: 0.38 },
];

/** Scripted ASSIST run: [ms, action]. Fed through the same reducer as the live console. */
export const SCRIPT: Array<[number, LiveAction]> = [
  [0, { type: 'local_fragment', text: 'Sunday… Priya… cake… no', id: 'demo-seg', ts: '' }],
  [900, ev('run.started', { pipeline: 'ASSIST', contextUsed: true })],
  [1000, started('classify')],
  [1050, started('fragment_analyze')],
  [1050, started('retrieve_raw_memory')],
  [1050, started('retrieve_wordmap')],
  [
    1500,
    ev('segment.classified', {
      kind: 'FRAGMENT',
      reason: 'Telegraphic speech with a negation',
      source: 'agent',
    }),
  ],
  [1500, done('classify', p50('classify', 1478))],
  [1700, done('retrieve_raw_memory', p50('retrieve_raw_memory', 13), { retrieval: HITS })],
  [1700, done('retrieve_wordmap', p50('retrieve_wordmap', 14), { retrieval: [] })],
  [2100, done('fragment_analyze', p50('fragment_analyze', 2280))],
  [2200, started('retrieve_memory')],
  [2450, done('retrieve_memory', p50('retrieve_memory', 18), { retrieval: HITS })],
  [2550, started('hypothesize')],
  [
    4300,
    ev('hypotheses.generated', {
      hypotheses: [
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
      ],
    }),
  ],
  [4300, done('hypothesize', p50('hypothesize', 4739))],
  [4400, done('compose_question', 2)],
  [4500, done('tts_question', 3)],
  [
    4700,
    ev('confirmation.asked', {
      confirmationId: 'demo-conf',
      question: 'Do you want to tell Priya not to bring cake on Sunday?',
      currentIndex: 0,
      hypothesesCount: 3,
    }),
  ],
  [4700, done('await_confirmation', 10)],
  [
    7600,
    ev('assist.resolved', {
      confirmationId: 'demo-conf',
      finalSentence: 'Please tell Priya not to bring cake on Sunday.',
    }),
  ],
];
export const PRESS_AT = 7000;
export const LOOP_MS = 13500;

/** Final frame, for reduced-motion users and as the initial render. */
export function finalState(): LiveState {
  return SCRIPT.reduce((s, [, a]) => liveReducer(s, a), initialLive);
}

export function useScriptedDemo(paused = false): { state: LiveState; pressed: boolean } {
  const reduce =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [state, dispatch] = useReducer(liveReducer, reduce ? finalState() : initialLive);
  const [pressed, setPressed] = useState(reduce);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (reduce || paused) return;
    const clear = () => timers.current.forEach(clearTimeout);
    const run = () => {
      dispatch({ type: 'reset' });
      setPressed(false);
      for (const [t, a] of SCRIPT) {
        timers.current.push(
          setTimeout(
            () => dispatch(a.type === 'local_fragment' ? { ...a, ts: new Date().toISOString() } : a),
            t,
          ),
        );
      }
      timers.current.push(setTimeout(() => setPressed(true), PRESS_AT));
      timers.current.push(setTimeout(run, LOOP_MS));
    };
    run();
    return clear;
  }, [reduce, paused]);

  return { state, pressed };
}
