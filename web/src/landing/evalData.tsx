import { cn } from '../design/cn';

export interface StepStat {
  node: string;
  count: number;
  p50Ms: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}
export interface Mode {
  mode: string;
  top1: number;
  top3: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  total: number;
  top1Hits: number;
  top3Hits: number;
  reqContextTotal: number;
  reqContextHitsTop1: number;
  reqContextHitsTop3: number;
  noContextTotal: number;
  noContextHitsTop1: number;
  noContextHitsTop3: number;
  stepStats: Record<string, StepStat>;
}
export interface Report {
  timestamp: string;
  provenance: { mode: 'live' | 'mock'; provider: string; model: string; judge: string };
  totalFragments: number;
  results: Mode[];
}

export interface EvalFacts {
  live: boolean;
  model: string;
  provider: string;
  judge: string;
  date: string;
  timestamp: string;
  n: number;
  ctxTotal: number;
  noCtxTotal: number;
  onHits: number;
  offHits: number;
  onTop1: number;
  offTop1: number;
  onTop3All: number;
  offTop3All: number;
  /** Plain-language note on first-question accuracy, generated from the numbers. */
  firstQuestionNote: string;
  on: Mode;
  off: Mode;
}

/** Everything the UI shows comes straight from the report; nothing is typed or rounded here. */
export function evalFacts(r: Report): EvalFacts {
  const on = r.results.find((x) => x.mode === 'context ON')!;
  const off = r.results.find((x) => x.mode === 'context OFF')!;
  const delta = on.top1Hits - off.top1Hits;
  const firstQuestionNote =
    delta > 0
      ? `First-question accuracy improved: ${on.top1Hits} of ${on.total} with memory vs ${off.top1Hits} without.`
      : delta === 0
        ? `First-question accuracy did not improve in this run (${on.top1Hits} of ${on.total} both ways).`
        : `First-question accuracy did not improve in this run (${on.top1Hits} of ${on.total} with memory vs ${off.top1Hits} without).`;
  return {
    live: r.provenance.mode === 'live',
    model: r.provenance.model,
    provider: r.provenance.provider,
    judge: r.provenance.judge,
    date: new Date(r.timestamp).toISOString().slice(0, 10),
    timestamp: r.timestamp,
    n: r.totalFragments,
    ctxTotal: on.reqContextTotal,
    noCtxTotal: on.noContextTotal,
    onHits: on.reqContextHitsTop3,
    offHits: off.reqContextHitsTop3,
    onTop1: on.top1Hits,
    offTop1: off.top1Hits,
    onTop3All: on.top3Hits,
    offTop3All: off.top3Hits,
    firstQuestionNote,
    on,
    off,
  };
}

/** A big ratio with a thin proportional bar. */
export function BigRatio({
  label,
  hits,
  total,
  strong,
  size = 'lg',
}: {
  label: string;
  hits: number;
  total: number;
  strong?: boolean;
  size?: 'md' | 'lg';
}) {
  const w = total ? (hits / total) * 100 : 0;
  return (
    <div>
      <p className="text-[13px] text-muted">{label}</p>
      <p
        className={cn(
          'mono mb-4 mt-3 leading-[0.95] tracking-[-0.06em]',
          size === 'lg' ? 'text-[64px] sm:text-[96px]' : 'text-[56px]',
          strong ? 'text-ink' : 'text-muted',
        )}
      >
        {hits}
        <span
          className={cn(
            'tracking-[-0.04em] text-faint',
            size === 'lg' ? 'text-[32px] sm:text-[44px]' : 'text-[28px]',
          )}
        >
          {' '}
          of {total}
        </span>
      </p>
      <div
        className="h-1.5 overflow-hidden rounded-[3px] bg-white/[0.08]"
        role="img"
        aria-label={`${label}: ${hits} of ${total}`}
      >
        <div className={cn('h-full', strong ? 'bg-ink' : 'bg-faint')} style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}
