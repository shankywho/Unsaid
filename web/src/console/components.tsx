import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Volume2 } from 'lucide-react';
import { Reveal } from '../design/motion';
import { cn } from '../design/cn';
import {
  Button,
  Chip,
  Fragment,
  Kbd,
  LatencyChip,
  Resolved,
  ScoreBar,
  Tag,
  Waveform,
  fmtMs,
} from '../design/primitives';
import { EmptyState } from '../design/feedback';
import {
  NODES,
  PARALLEL,
  SEQUENTIAL,
  nodeHint,
  nodeLabel,
  skipReason,
  speechAct,
  type ConfView,
  type FeedItem,
  type Hit,
  type HypView,
  type LearnView,
  type Service,
  type StepView,
} from './liveState';

/* ============ Transcript ============ */

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour12: false });
};
const sourceTag = (s?: string) => (s === 'SIMULATED' ? 'sim' : s ? 'omi' : '');

export function TranscriptFeed({ feed, patientName }: { feed: FeedItem[]; patientName: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [feed.length]);
  if (feed.length === 0) {
    return (
      <EmptyState
        title="Nothing to show yet"
        body="Conversation from Omi appears here as it is heard. To try it now, type a fragment below."
      />
    );
  }
  return (
    <div role="log" aria-label="Transcript">
      {feed.map((f) =>
        f.kind === 'note' ? (
          <Reveal key={f.id} className="grid grid-cols-[54px_1fr] gap-3 border-t border-line py-2.5 first:border-t-0">
            <span className="mono pt-0.5 text-[11px] text-faint">{clock(f.ts)}</span>
            <p className="mono text-[12px] leading-5 text-faint">{f.text}</p>
          </Reveal>
        ) : (
          <Reveal key={f.id} className="grid grid-cols-[54px_1fr] gap-3 border-t border-line py-3 first:border-t-0">
            <span className="mono pt-0.5 text-[11px] text-faint">{clock(f.ts)}</span>
            <div>
              <p className="mb-0.5 flex items-center gap-2 text-[12px] text-muted">
                <span className="font-medium">{f.isUser ? patientName : (f.speaker ?? 'Household')}</span>
                {sourceTag(f.source) && (
                  <span className="mono rounded-[4px] border border-line px-1.5 text-[10.5px] text-faint">
                    {sourceTag(f.source)}
                  </span>
                )}
              </p>
              {f.isUser ? (
                <Fragment className="block text-[13px] text-ink">{f.text}</Fragment>
              ) : (
                <p className="text-[14px] leading-[1.45] text-ink">{f.text}</p>
              )}
            </div>
          </Reveal>
        ),
      )}
      <div ref={end} />
    </div>
  );
}

/* ============ Facts and hypotheses (rows, never cards) ============ */

export function FactRow({
  hit,
  index,
  highlighted,
  onHighlight,
}: {
  hit: Hit;
  index: number;
  highlighted?: boolean;
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
        'grid grid-cols-[1fr_auto] items-center gap-4 border-t border-line py-2.5 text-[13.5px] leading-snug',
        highlighted && 'bg-white/[0.04]',
      )}
    >
      <span>
        <span className="block text-ink">{hit.text}</span>
        <span className="mono mt-0.5 block text-[11px] text-faint">
          f{index + 1}
          {hit.type ? ` · ${hit.type}` : ''}
        </span>
      </span>
      <ScoreBar score={hit.score} label="match" />
    </li>
  );
}

export function HypothesisList({
  hyps,
  hits,
  currentIndex,
  confirmedIndex,
  highlightId = null,
  onHighlight,
}: {
  hyps: HypView[];
  hits: Hit[];
  currentIndex?: number;
  confirmedIndex?: number;
  highlightId?: string | null;
  onHighlight?: (id: string | null) => void;
}) {
  if (hyps.length === 0) return null;
  const ref = (id: string) => {
    const i = hits.findIndex((h) => h.id === id);
    return i >= 0 ? `f${i + 1}` : id.slice(0, 4);
  };
  return (
    <ol aria-label="Ranked meanings">
      {hyps.map((h) => {
        const asked = currentIndex !== undefined && h.rank < currentIndex;
        const now = currentIndex === h.rank;
        const ok = confirmedIndex === h.rank;
        return (
          <li
            key={h.rank}
            className="reveal grid grid-cols-[18px_1fr_auto] gap-3 border-t border-line py-3"
            style={{ animationDelay: `${h.rank * 60}ms` }}
          >
            <span className={cn('mono pt-0.5 text-[12px]', now || ok ? 'text-accent' : 'text-faint')}>
              {h.rank + 1}
            </span>
            <div>
              <p
                className={cn(
                  'text-[14px] leading-[1.4]',
                  now || ok ? 'text-ink' : 'text-muted',
                  asked && 'line-through decoration-white/20',
                )}
              >
                {h.sentence}
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-2">
                <Tag>{speechAct(h.sentence)}</Tag>
                {h.evidenceIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={`Evidence ${ref(id)}`}
                    onMouseEnter={() => onHighlight?.(id)}
                    onMouseLeave={() => onHighlight?.(null)}
                    onFocus={() => onHighlight?.(id)}
                    onBlur={() => onHighlight?.(null)}
                    className={cn(
                      'mono rounded-[4px] px-1 text-[11px]',
                      highlightId === id ? 'bg-white/10 text-ink' : 'text-faint',
                    )}
                  >
                    {ref(id)}
                  </button>
                ))}
                {now && <span className="text-[11px] font-medium text-accent">asking now</span>}
                {asked && <span className="text-[11px] text-faint">not this one</span>}
              </p>
            </div>
            <span className="mono pt-0.5 text-[12px] tabular-nums text-muted">{h.confidence.toFixed(2)}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ============ Reasoning timeline: the real DAG ============ */

const FALLBACK_SERVICE: Record<string, Service> = {
  classify: { provider: 'lyzr', name: 'utterance_classifier' },
  fragment_analyze: { provider: 'lyzr', name: 'fragment_analyst' },
  retrieve_raw_memory: { provider: 'qdrant', name: 'memory' },
  retrieve_wordmap: { provider: 'qdrant', name: 'wordmap' },
  retrieve_memory: { provider: 'qdrant', name: 'memory' },
  hypothesize: { provider: 'lyzr', name: 'intent_hypothesizer' },
  compose_question: { provider: 'local', name: 'compose_question' },
  tts_question: { provider: 'tts', name: 'speech' },
  await_confirmation: { provider: 'redis', name: 'pending-confirmation' },
};
export const serviceLabel = (s: Service): string =>
  `${s.provider} · ${s.name.replace(/^(test_)?unsaid_/, '')}`;

/** Wall-clock length of the trace on the shared scale (the latest end across all steps). */
export function traceTotalMs(steps: StepView[]): number | undefined {
  const ends = steps
    .filter((s) => s.latencyMs !== undefined && s.node !== 'await_confirmation')
    .map((s) => (s.startOffsetMs ?? 0) + (s.latencyMs ?? 0));
  return ends.length ? Math.max(...ends) : undefined;
}

type RowStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

function Dot({ status }: { status: RowStatus }) {
  const base = 'h-2 w-2 rounded-full';
  if (status === 'running') return <i className={cn(base, 'pulse bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]')} />;
  if (status === 'pending') return <i className={cn(base, 'border-[1.5px] border-ghost')} />;
  if (status === 'failed') return <i className={cn(base, 'bg-danger')} />;
  if (status === 'skipped') return <i className={cn(base, 'border-[1.5px] border-faint')} />;
  return <i className={cn(base, 'bg-muted')} />;
}

function StepRow({
  node,
  step,
  status,
  sub,
  right,
  bar,
  detail,
  open,
  onToggle,
}: {
  node: string;
  step?: StepView;
  status: RowStatus;
  sub?: string;
  right?: string;
  bar?: { left: number; width: number };
  detail?: React.ReactNode;
  open?: boolean;
  onToggle?: () => void;
}) {
  const service = step?.service ?? FALLBACK_SERVICE[node];
  const label = nodeLabel(node);
  return (
    <li className="tl-row relative grid grid-cols-[20px_1fr_auto] items-start gap-x-2.5 py-2.5" data-node={node} data-status={status}>
      <span className="flex h-[22px] items-center justify-center" aria-hidden="true">
        <Dot status={status} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {detail && onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              className={cn(
                'inline-flex items-center gap-1 text-left text-[14px] font-medium leading-[22px]',
                status === 'pending' ? 'text-faint' : 'text-ink',
              )}
            >
              {label}
              <ChevronRight
                className={cn('h-3.5 w-3.5 text-faint transition-transform duration-150', open && 'rotate-90')}
                aria-hidden="true"
              />
            </button>
          ) : (
            <span className={cn('text-[14px] font-medium leading-[22px]', status === 'pending' ? 'text-faint' : 'text-ink')}>
              {label}
            </span>
          )}
          {service && <Tag>{serviceLabel(service)}</Tag>}
        </div>
        <p className="text-[12.5px] leading-[1.4] text-faint">{sub ?? nodeHint(node)}</p>
        {bar && (
          <div className="mt-1.5 h-1 rounded-full bg-white/[0.07]" aria-hidden="true">
            <div
              className={cn('relative h-full rounded-full', status === 'running' ? 'shimline' : 'bg-muted')}
              style={{ marginLeft: `${bar.left}%`, width: `${Math.max(bar.width, 1.5)}%` }}
            />
          </div>
        )}
        {open && detail && <div className="mt-2">{detail}</div>}
      </div>
      <span className={cn('mono text-[12px] leading-[22px] tabular-nums', status === 'running' ? 'text-accent' : 'text-muted')}>
        {right ?? (step?.latencyMs !== undefined ? fmtMs(step.latencyMs) : '')}
      </span>
    </li>
  );
}

export function LearnFollowUp({ learn }: { learn?: LearnView }) {
  if (!learn) return null;
  const text =
    learn.status === 'queued'
      ? 'LEARN queued'
      : learn.status === 'running'
        ? 'LEARN running'
        : `LEARN done${learn.summary ? ` · ${learn.summary}` : ' · word map updated'}`;
  return (
    <p
      className="mono mt-2 flex items-center gap-2 border-t border-line pt-3 text-[12px] text-muted"
      data-testid="learn-followup"
    >
      <span aria-hidden="true">→</span>
      {learn.status === 'running' && <i className="pulse h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
      {text}
    </p>
  );
}

export function ReasoningTimeline({
  steps,
  thinking,
  classified,
  hyps = [],
  hits = [],
  conf,
  learn,
  highlightId = null,
  onHighlight,
  ghost = false,
}: {
  steps: StepView[];
  thinking: boolean;
  classified?: { kind: string; reason: string };
  hyps?: HypView[];
  hits?: Hit[];
  conf?: ConfView;
  learn?: LearnView;
  highlightId?: string | null;
  onHighlight?: (id: string | null) => void;
  ghost?: boolean;
}) {
  // raw-memory and word-map hits start collapsed; the matched facts and the ranked meanings start open
  const [closed, setClosed] = useState<Record<string, boolean>>({ retrieve_raw_memory: true, retrieve_wordmap: true });
  const by = new Map(steps.map((s) => [s.node, s]));
  const idle = steps.length === 0 && !thinking;
  const parallel = PARALLEL.map((id) => by.get(id)).filter((s): s is StepView => !!s);
  const scale = Math.max(1, ...parallel.map((s) => (s.startOffsetMs ?? 0) + (s.latencyMs ?? 0)));

  const statusOf = (id: string): RowStatus => {
    const s = by.get(id);
    if (id === 'await_confirmation') {
      if (conf?.status === 'pending') return 'running';
      if (conf) return 'done';
    }
    if (!s) return 'pending';
    return s.status === 'done' ? 'done' : s.status === 'running' ? 'running' : s.status;
  };
  const sub = (id: string): string | undefined => {
    const s = by.get(id);
    if (s?.status === 'skipped') {
      const why = skipReason(s);
      if (why === 'context disabled') return 'Skipped: memory is switched off';
      return why ? `Skipped: ${why}` : 'Skipped';
    }
    if (s?.status === 'failed') return s.error ?? 'This step failed';
    if (id === 'classify' && classified) return `${classified.kind.toLowerCase()} · ${classified.reason}`;
    if (id === 'hypothesize' && hyps.length) return `${hyps.length} possible meanings`;
    if ((id === 'retrieve_memory' || id === 'retrieve_raw_memory' || id === 'retrieve_wordmap') && s?.retrieval)
      return `${s.retrieval.length} ${s.retrieval.length === 1 ? 'hit' : 'hits'}`;
    if (id === 'await_confirmation' && conf)
      return conf.status === 'pending'
        ? undefined
        : conf.status === 'resolved'
          ? `Yes on question ${conf.index + 1}`
          : conf.status === 'unresolved'
            ? 'No on every question'
            : 'Closed without an answer';
    return undefined;
  };
  const rightOf = (id: string): string | undefined => {
    if (id !== 'await_confirmation' || !conf) return undefined;
    if (conf.status === 'pending') return 'waiting';
    return conf.answeredMs !== undefined ? fmtMs(conf.answeredMs) : undefined;
  };
  const detailOf = (id: string): React.ReactNode => {
    const s = by.get(id);
    if (s?.status === 'skipped') return null;
    if ((id === 'retrieve_memory' || id === 'retrieve_raw_memory' || id === 'retrieve_wordmap') && s?.retrieval) {
      if (s.retrieval.length === 0) return <p className="text-[13px] text-faint">Nothing relevant found</p>;
      return (
        <ul>
          {s.retrieval.slice(0, 4).map((h, i) => (
            <FactRow key={h.id} hit={h} index={i} highlighted={highlightId === h.id} onHighlight={onHighlight} />
          ))}
        </ul>
      );
    }
    if (id === 'hypothesize' && hyps.length)
      return (
        <HypothesisList
          hyps={hyps}
          hits={hits}
          currentIndex={conf?.status === 'pending' || conf?.status === 'resolved' ? conf.index : undefined}
          confirmedIndex={conf?.status === 'resolved' ? conf.index : undefined}
          highlightId={highlightId}
          onHighlight={onHighlight}
        />
      );
    return null;
  };

  const row = (id: string, parallelRow = false) => {
    const step = by.get(id);
    const detail = detailOf(id);
    const status = statusOf(id);
    const bar =
      parallelRow && step && (step.latencyMs !== undefined || status === 'running')
        ? {
            left: ((step.startOffsetMs ?? 0) / scale) * 100,
            width:
              step.latencyMs !== undefined
                ? (step.latencyMs / scale) * 100
                : 100 - ((step.startOffsetMs ?? 0) / scale) * 100,
          }
        : undefined;
    return (
      <StepRow
        key={id}
        node={id}
        step={step}
        status={status}
        sub={sub(id)}
        right={rightOf(id)}
        bar={bar}
        detail={detail}
        open={!closed[id]}
        onToggle={() => setClosed((c) => ({ ...c, [id]: !c[id] }))}
      />
    );
  };

  return (
    <div data-idle={ghost || idle ? 'true' : undefined}>
      <ol aria-label="Reasoning steps" aria-busy={thinking}>
        <li aria-hidden="true" className="mb-0.5 mt-1 flex items-center gap-2 text-[11px] font-medium text-faint">
          In parallel
          <span className="h-px flex-1 bg-line" />
        </li>
        {PARALLEL.map((id) => row(id, true))}
        <li aria-hidden="true" className="mb-0.5 mt-2 flex items-center gap-2 text-[11px] font-medium text-faint">
          Then
          <span className="h-px flex-1 bg-line" />
        </li>
        {SEQUENTIAL.map((id) => row(id))}
      </ol>
      <LearnFollowUp learn={learn} />
    </div>
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
    <div className="my-6 flex items-center gap-3.5">
      <Waveform active={playing} />
      <Button variant="ghost" size="sm" onClick={replay}>
        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
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
  patientName,
  learn,
  pressed = null,
  ellapsedHint,
}: {
  conf?: ConfView;
  fragment?: string;
  thinking: boolean;
  busy?: boolean;
  onAnswer: (a: 'yes' | 'no') => void;
  patientName: string;
  learn?: LearnView;
  pressed?: 'yes' | 'no' | null;
  ellapsedHint?: string;
}) {
  const frag = fragment && (
    <Fragment className="block pb-7 pt-1 text-[15px]">{fragment}</Fragment>
  );
  if (!conf && !thinking) {
    return (
      <div className="pt-5" data-testid="conversation-idle">
        <p className="mono text-[13px] text-faint">Waiting for a fragment</p>
        <p className="my-2 mb-6 text-[40px] font-medium leading-none tracking-[-0.04em] text-faint">Listening…</p>
        <Waveform active={false} bars={30} />
        <p className="mt-5 max-w-[300px] text-[13px] leading-normal text-faint">
          When {patientName} says a few broken words, Unsaid asks one yes/no question here.
        </p>
      </div>
    );
  }
  if (!conf) {
    return (
      <div role="status" aria-label="Working out a question">
        {frag}
        <div className="flex items-center gap-2.5">
          <i className="pulse h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          <span className="text-[20px] tracking-[-0.02em] text-ink">Working out what {patientName.split(' ')[0]} means</span>
        </div>
        <p className="mt-3 text-[13px] text-faint">{ellapsedHint ?? 'Memory is used when it is switched on.'}</p>
      </div>
    );
  }
  if (conf.status === 'resolved') {
    return (
      <Reveal data-testid="confirmed">
        {frag}
        <Resolved size="xl" glow>
          {conf.finalSentence}
        </Resolved>
        <div className="mt-6">
          <Chip tone="live">
            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> Spoken to caregiver
          </Chip>
        </div>
        <VoiceBar url={conf.finalAudioUrl} />
        {learn && <p className="text-[13px] leading-normal text-faint">Saved for next time.</p>}
      </Reveal>
    );
  }
  if (conf.status === 'unresolved') {
    return (
      <Reveal>
        {frag}
        <Resolved size="md">None of the three meanings fit.</Resolved>
        <p className="mt-3 text-[14px] text-muted">
          Nothing was spoken. Ask in a different way, or try a more specific fragment.
        </p>
        {conf.fallbackQuestion && (
          <p className="mt-5 border-t border-line pt-4 text-[20px] tracking-[-0.02em] text-ink">{conf.fallbackQuestion}</p>
        )}
      </Reveal>
    );
  }
  if (conf.status === 'expired') {
    return (
      <Reveal>
        {frag}
        <Resolved size="md">
          {conf.reason === 'superseded' ? 'Replaced by a newer fragment.' : 'No answer in time.'}
        </Resolved>
        <p className="mt-3 text-[14px] text-muted">
          {conf.reason === 'superseded'
            ? 'A newer fragment arrived, so this question was closed. Nothing was spoken.'
            : 'The question closed on its own. Nothing was spoken. Say the fragment again to restart.'}
        </p>
      </Reveal>
    );
  }
  return (
    <div>
      {frag}
      <div className="mb-3.5 flex items-center gap-3 text-[12px] text-muted">
        <span className="mono">
          Question {conf.index + 1} of {conf.count}
        </span>
        <span className="flex gap-1" aria-hidden="true">
          {Array.from({ length: conf.count }, (_, i) => (
            <i key={i} className={cn('h-[3px] w-5 rounded-sm', i <= conf.index ? 'bg-accent' : 'bg-white/[0.12]')} />
          ))}
        </span>
      </div>
      <h2 className="text-[30px] font-medium leading-[1.18] tracking-[-0.035em] text-ink">{conf.question}</h2>
      <VoiceBar url={conf.audioUrl} />
      <div className="grid grid-cols-2 gap-3">
        <Button
          size="xl"
          variant={pressed === 'yes' ? 'primary' : 'secondary'}
          onClick={() => onAnswer('yes')}
          disabled={busy}
          aria-keyshortcuts="Y"
        >
          Yes <Kbd>Y</Kbd>
        </Button>
        <Button
          size="xl"
          variant={pressed === 'no' ? 'primary' : 'secondary'}
          onClick={() => onAnswer('no')}
          disabled={busy}
          aria-keyshortcuts="N"
        >
          No <Kbd>N</Kbd>
        </Button>
      </div>
    </div>
  );
}

export { NODES, LatencyChip };
