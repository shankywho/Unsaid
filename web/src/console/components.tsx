import { useEffect, useRef, useState } from 'react';
import { Check, Minus, X, Volume2, BookmarkPlus, Sparkles } from 'lucide-react';
import { Reveal } from '../design/motion';
import { cn } from '../design/cn';
import {
  Button,
  Card,
  Fragment,
  Kbd,
  LatencyChip,
  Mono,
  Resolved,
  ScoreBar,
  Tag,
  Waveform,
} from '../design/primitives';
import { EmptyState } from '../design/feedback';
import {
  NODES,
  nodeActive,
  nodeLabel,
  orderedSteps,
  speechAct,
  type ConfView,
  type FeedItem,
  type Hit,
  type HypView,
  type StepView,
} from './liveState';

/* ============ Transcript ============ */

export function TranscriptFeed({ feed }: { feed: FeedItem[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [feed.length]);
  if (feed.length === 0) {
    return (
      <EmptyState
        fragment="waiting… for… speech…"
        title="No speech yet"
        body="Lines appear here as Omi hears them. To try it now, type a fragment below."
      />
    );
  }
  return (
    <div role="log" aria-label="Transcript" className="space-y-4">
      {feed.map((f) =>
        f.kind === 'note' ? (
          <Reveal key={f.id}>
            <p className="flex items-start gap-2 rounded-[10px] bg-surface px-3 py-2 text-[14px] text-muted">
              <BookmarkPlus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{f.text}</span>
            </p>
          </Reveal>
        ) : (
          <Reveal key={f.id}>
            <div>
              <p className="mb-0.5 text-[13px] font-medium text-muted">
                {f.speaker ?? (f.isUser ? 'Patient' : 'Household')}
                {f.source === 'SIMULATED' && <span className="ml-2 font-normal">simulated</span>}
              </p>
              {f.isUser ? (
                <Fragment className="block text-[15px]">{f.text}</Fragment>
              ) : (
                <p className="text-[16px] text-ink">{f.text}</p>
              )}
            </div>
          </Reveal>
        ),
      )}
      <div ref={end} />
    </div>
  );
}

/* ============ Reasoning ============ */

function summary(
  step: StepView,
  ctx: { classified?: { kind: string; reason: string }; hypCount: number },
): string | null {
  if (step.status === 'skipped') return 'Skipped: memory is switched off for this patient';
  if (step.status === 'failed') return step.error ?? 'This step failed';
  switch (step.node) {
    case 'classify':
      return ctx.classified
        ? `${ctx.classified.kind === 'FRAGMENT' ? 'Fragment' : ctx.classified.kind.toLowerCase().replace('_', ' ')}: ${ctx.classified.reason}`
        : null;
    case 'hypothesize':
      return ctx.hypCount ? `${ctx.hypCount} possible meanings` : null;
    case 'compose_question':
      return 'Question ready';
    case 'tts_question':
      return 'Voice ready';
    case 'await_confirmation':
      return 'Question sent';
    default:
      return null;
  }
}

function StepIcon({ status }: { status: StepView['status'] }) {
  const base = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border';
  if (status === 'running')
    return (
      <span className={cn(base, 'border-accent bg-accent-soft')} aria-hidden="true">
        <span className="dot-pulse h-2 w-2 rounded-full bg-accent" />
      </span>
    );
  if (status === 'done')
    return (
      <span className={cn(base, 'border-ink bg-ink text-white')} aria-hidden="true">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  if (status === 'failed')
    return (
      <span className={cn(base, 'border-danger bg-danger-soft text-danger')} aria-hidden="true">
        <X className="h-3.5 w-3.5" />
      </span>
    );
  return (
    <span className={cn(base, 'border-border-strong bg-surface text-muted')} aria-hidden="true">
      <Minus className="h-3.5 w-3.5" />
    </span>
  );
}

export function FactChip({
  hit,
  highlighted,
  onHighlight,
}: {
  hit: Hit;
  highlighted: boolean;
  onHighlight?: (id: string | null) => void;
}) {
  return (
    <li
      tabIndex={0}
      data-fact-id={hit.id}
      onMouseEnter={() => onHighlight?.(hit.id)}
      onMouseLeave={() => onHighlight?.(null)}
      onFocus={() => onHighlight?.(hit.id)}
      onBlur={() => onHighlight?.(null)}
      className={cn(
        'flex items-center justify-between gap-3 rounded-[10px] border px-3 py-2 text-[14px] leading-snug transition-colors duration-150',
        highlighted ? 'border-ink bg-surface' : 'border-border bg-canvas',
      )}
    >
      <span className="text-ink">{hit.text}</span>
      <ScoreBar score={hit.score} label="match" />
    </li>
  );
}

export function ReasoningStepper({
  steps,
  thinking,
  classified,
  hypCount = 0,
  highlightId = null,
  onHighlight,
  waiting,
}: {
  steps: StepView[];
  thinking: boolean;
  classified?: { kind: string; reason: string };
  hypCount?: number;
  highlightId?: string | null;
  onHighlight?: (id: string | null) => void;
  waiting?: boolean;
}) {
  const ordered = orderedSteps(steps);
  if (ordered.length === 0) {
    return thinking || waiting ? (
      <p className="rounded-[10px] bg-surface px-3 py-3 text-[15px] text-muted" role="status">
        Starting<span className="dot-pulse">…</span>
      </p>
    ) : (
      <EmptyState
        fragment="how… it… thinks…"
        title="Reasoning appears here"
        body="Every step the agents take shows up as it happens, with how long it took and which memories it used."
      />
    );
  }
  return (
    <ol className="space-y-3" aria-label="Reasoning steps" aria-busy={thinking}>
      {ordered.map((s) => {
        const sum = summary(s, { classified, hypCount });
        return (
          <li key={s.node}>
            <Reveal>
              <Card className={cn('p-3.5', s.status === 'running' && 'border-accent/60')}>
                <div className="flex items-center gap-3">
                  <StepIcon status={s.status} />
                  <p className="flex-1 text-[15px] font-medium text-ink">
                    {s.status === 'running' ? (
                      <>
                        {nodeActive(s.node)}
                        <span className="dot-pulse" aria-hidden="true">
                          …
                        </span>
                      </>
                    ) : (
                      nodeLabel(s.node)
                    )}
                  </p>
                  <LatencyChip ms={s.latencyMs} />
                </div>
                {sum && <p className="mt-2 pl-9 text-[14px] text-muted">{sum}</p>}
                {s.retrieval && s.status !== 'skipped' && (
                  <div className="mt-2 pl-9">
                    {s.retrieval.length === 0 ? (
                      <p className="text-[14px] text-muted">Nothing relevant found</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {s.retrieval.slice(0, 4).map((h) => (
                          <FactChip
                            key={h.id}
                            hit={h}
                            highlighted={highlightId === h.id}
                            onHighlight={onHighlight}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            </Reveal>
          </li>
        );
      })}
    </ol>
  );
}

/* ============ Hypotheses ============ */

export function HypothesisCards({
  hyps,
  hits,
  currentIndex,
  highlightId = null,
  onHighlight,
}: {
  hyps: HypView[];
  hits: Hit[];
  currentIndex?: number;
  highlightId?: string | null;
  onHighlight?: (id: string | null) => void;
}) {
  if (hyps.length === 0) return null;
  return (
    <section aria-label="Possible meanings" className="mt-5">
      <h3 className="mb-2 font-mono text-[13px] text-muted">three possible meanings…</h3>
      <ol className="space-y-3">
        {hyps.map((h) => {
          const asked = currentIndex !== undefined && h.rank < currentIndex;
          const now = currentIndex === h.rank;
          const act = speechAct(h.sentence);
          return (
            <li key={h.rank}>
              <Reveal delay={h.rank * 0.06}>
                <Card className={cn('p-4', now && 'border-ink', asked && 'bg-surface')}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Tag>{act}</Tag>
                    {now && (
                      <Tag tone="accent">
                        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> Asking now
                      </Tag>
                    )}
                    {asked && <Tag>Not this one</Tag>}
                    <span className="ml-auto">
                      <ScoreBar score={h.confidence} label="confidence" />
                    </span>
                  </div>
                  <p
                    className={cn(
                      'text-[17px] leading-snug',
                      asked ? '' : 'text-ink',
                      asked && 'text-muted line-through decoration-border-strong',
                    )}
                  >
                    {h.sentence}
                  </p>
                  {h.evidenceIds.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Based on">
                      {h.evidenceIds.map((id) => {
                        const fact = hits.find((x) => x.id === id);
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              onMouseEnter={() => onHighlight?.(id)}
                              onMouseLeave={() => onHighlight?.(null)}
                              onFocus={() => onHighlight?.(id)}
                              onBlur={() => onHighlight?.(null)}
                              className={cn(
                                'max-w-full truncate rounded-full border px-2.5 py-0.5 text-[13px] text-muted',
                                highlightId === id
                                  ? 'border-ink bg-surface text-ink'
                                  : 'border-border bg-canvas',
                              )}
                            >
                              {fact ? fact.text : 'a stored memory'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              </Reveal>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ============ Conversation ============ */

export function useAutoAudio(url?: string) {
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    setPlaying(false);
    setBlocked(false);
    if (!url) return;
    const a = new Audio(url);
    ref.current = a;
    a.onplay = () => setPlaying(true);
    a.onended = () => setPlaying(false);
    a.onpause = () => setPlaying(false);
    a.play().catch(() => setBlocked(true));
    return () => {
      a.pause();
      ref.current = null;
    };
  }, [url]);
  const replay = () => {
    const a = ref.current;
    if (!a) return;
    a.currentTime = 0;
    setBlocked(false);
    a.play().catch(() => setBlocked(true));
  };
  return { playing, blocked, replay };
}

function VoiceBar({ url }: { url?: string }) {
  const { playing, blocked, replay } = useAutoAudio(url);
  if (!url) return null;
  return (
    <div className="flex items-center gap-3">
      <Waveform active={playing} />
      <Button variant="secondary" size="sm" onClick={replay}>
        <Volume2 className="h-4 w-4" aria-hidden="true" />
        {blocked ? 'Play question' : 'Hear again'}
      </Button>
    </div>
  );
}

export function ConversationPanel({
  conf,
  fragment,
  thinking,
  busy,
  onAnswer,
  yesLabel = 'Yes',
  noLabel = 'No',
  pressed = null,
}: {
  conf?: ConfView;
  fragment?: string;
  thinking: boolean;
  busy?: boolean;
  onAnswer: (a: 'yes' | 'no') => void;
  yesLabel?: string;
  noLabel?: string;
  pressed?: 'yes' | 'no' | null;
}) {
  if (!conf && !thinking) {
    return (
      <EmptyState
        fragment="say… something…"
        title="Nothing to confirm yet"
        body="When a fragment is heard, the question appears here with Yes and No buttons. Nothing is ever spoken without a Yes."
      />
    );
  }
  if (!conf) {
    return (
      <div className="space-y-4" role="status" aria-label="Working out a question">
        {fragment && <Fragment className="block">{fragment}</Fragment>}
        <div className="space-y-2">
          <div className="skeleton h-8 w-4/5" />
          <div className="skeleton h-8 w-3/5" />
        </div>
        <p className="text-[15px] text-muted">
          Working out what was meant<span className="dot-pulse">…</span>
        </p>
      </div>
    );
  }

  if (conf.status === 'resolved') {
    return (
      <Reveal className="space-y-5">
        {fragment && <Fragment className="block">{fragment}</Fragment>}
        <Resolved size="xl" marked>
          {conf.finalSentence}
        </Resolved>
        <div className="flex flex-wrap items-center gap-3">
          <Tag tone="accent">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Spoken to caregiver
          </Tag>
          <VoiceBar url={conf.finalAudioUrl} />
        </div>
      </Reveal>
    );
  }
  if (conf.status === 'unresolved') {
    return (
      <Reveal className="space-y-4">
        {fragment && <Fragment className="block">{fragment}</Fragment>}
        <Resolved size="md">None of the three meanings fit.</Resolved>
        <p className="text-[16px] text-muted">
          Nothing was spoken. Ask in a different way, or try a more specific fragment.
        </p>
        {conf.fallbackQuestion && (
          <p className="rounded-[10px] bg-surface p-4 font-serif text-[22px] text-ink">
            {conf.fallbackQuestion}
          </p>
        )}
      </Reveal>
    );
  }
  if (conf.status === 'expired') {
    return (
      <Reveal className="space-y-4">
        {fragment && <Fragment className="block">{fragment}</Fragment>}
        <Resolved size="md">
          {conf.reason === 'superseded' ? 'Replaced by a newer fragment.' : 'No answer in time.'}
        </Resolved>
        <p className="text-[16px] text-muted">
          {conf.reason === 'superseded'
            ? 'A newer fragment arrived, so this question was closed. Nothing was spoken.'
            : 'The question closed on its own after 45 seconds. Nothing was spoken. Say the fragment again to restart.'}
        </p>
      </Reveal>
    );
  }
  return (
    <div className="space-y-6">
      {fragment && <Fragment className="block">{fragment}</Fragment>}
      <div className="space-y-3">
        <p className="font-mono text-[13px] text-muted">
          question {conf.index + 1} of {conf.count}
        </p>
        <Resolved size="lg" as="h2">
          {conf.question}
        </Resolved>
        <VoiceBar url={conf.audioUrl} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button
          size="xl"
          className={pressed === 'yes' ? 'ring-2 ring-accent ring-offset-2' : ''}
          onClick={() => onAnswer('yes')}
          disabled={busy}
          aria-keyshortcuts="Y"
        >
          {yesLabel} <Kbd>Y</Kbd>
        </Button>
        <Button
          size="xl"
          variant="secondary"
          className={pressed === 'no' ? 'ring-2 ring-accent ring-offset-2' : ''}
          onClick={() => onAnswer('no')}
          disabled={busy}
          aria-keyshortcuts="N"
        >
          {noLabel} <Kbd>N</Kbd>
        </Button>
      </div>
    </div>
  );
}

export { NODES, Mono };
