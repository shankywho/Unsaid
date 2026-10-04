import { cn } from '../design/cn';
import { pct } from '../console/format';

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
  date: string;
  n: number;
  ctxTotal: number;
  onHits: number;
  offHits: number;
}

/** Numbers come straight from the report: resolved within 3 yes/no questions on context-dependent fragments. */
export function evalFacts(r: Report): EvalFacts {
  const on = r.results.find((x) => x.mode === 'context ON')!;
  const off = r.results.find((x) => x.mode === 'context OFF')!;
  return {
    live: r.provenance.mode === 'live',
    model: r.provenance.model,
    date: new Date(r.timestamp).toISOString().slice(0, 10),
    n: r.totalFragments,
    ctxTotal: on.reqContextTotal,
    onHits: on.reqContextHitsTop3,
    offHits: off.reqContextHitsTop3,
  };
}

function Bar({
  label,
  hits,
  total,
  strong,
}: {
  label: string;
  hits: number;
  total: number;
  strong?: boolean;
}) {
  const w = total ? (hits / total) * 100 : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-4">
        <span className="text-[16px] text-ink">{label}</span>
        <span className="font-mono text-[14px] tabular-nums text-muted">
          {hits} of {total} · {pct(hits, total)}
        </span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full bg-border"
        role="img"
        aria-label={`${label}: ${hits} of ${total}`}
      >
        <div
          className={cn('h-full rounded-full', strong ? 'bg-ink' : 'bg-border-strong')}
          style={{ width: `${w}%` }}
        />
      </div>
    </div>
  );
}

export function EvalBars({ facts }: { facts: EvalFacts }) {
  return (
    <div className="space-y-5">
      <Bar label="With personal memory" hits={facts.onHits} total={facts.ctxTotal} strong />
      <Bar label="Without memory" hits={facts.offHits} total={facts.ctxTotal} />
    </div>
  );
}
