import evalReport from '../generated/eval.json';
import learnReport from '../generated/learn.json';
import { Card, Fragment, Mono, Tag } from '../design/primitives';
import { ms, pct } from './format';
import { EvalBars, evalFacts, type Mode, type Report } from '../landing/evalData';

const report = evalReport as unknown as Report;
const learn = learnReport as unknown as {
  timestamp: string;
  provenance: { mode: string; model: string };
  beforeAcc: number;
  afterAcc: number;
  results: unknown[];
} | null;

function Row({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr className="border-t border-border">
      <th scope="row" className="py-2.5 pr-4 text-left text-[15px] font-normal text-ink">
        {label}
      </th>
      <td className="py-2.5 pr-4 font-mono text-[14px] tabular-nums">{a}</td>
      <td className="py-2.5 font-mono text-[14px] tabular-nums">{b}</td>
    </tr>
  );
}

export function EvalPage() {
  const on = report.results.find((r) => r.mode === 'context ON') as Mode;
  const off = report.results.find((r) => r.mode === 'context OFF') as Mode;
  const f = evalFacts(report);
  const steps = Object.values(on.stepStats).filter((s) => s.count > 0);
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-5 py-8">
      <header className="space-y-1">
        <Fragment>measured… not… claimed…</Fragment>
        <h1 className="font-serif text-[40px] leading-tight">Evaluation</h1>
        <p className="max-w-xl text-[16px] text-muted">
          The most recent live run of pnpm eval, judged by the eval_judge agent. Nothing here is edited or
          rounded up.
        </p>
      </header>

      <Card className="flex flex-wrap items-center gap-3 p-4">
        <Tag tone={f.live ? 'success' : 'danger'}>{f.live ? 'Live run' : 'Mock run'}</Tag>
        <Mono>{f.model}</Mono>
        <Mono>judge: {report.provenance.judge}</Mono>
        <Mono>{f.date}</Mono>
        <Mono>{report.totalFragments} synthetic fragments</Mono>
      </Card>

      <section aria-labelledby="ctx" className="space-y-3">
        <h2 id="ctx" className="font-serif text-[28px]">
          Resolved within three yes/no questions
        </h2>
        <p className="text-[15px] text-muted">
          Fragments that need personal context ({f.ctxTotal}), with memory on and off.
        </p>
        <EvalBars facts={f} />
      </section>

      <section aria-labelledby="all" className="space-y-2">
        <h2 id="all" className="font-serif text-[28px]">
          All fragments
        </h2>
        <table className="w-full">
          <thead>
            <tr className="text-left text-[13px] font-medium text-muted">
              <th className="pb-2 font-medium">Measure</th>
              <th className="pb-2 font-medium">Memory on</th>
              <th className="pb-2 font-medium">Memory off</th>
            </tr>
          </thead>
          <tbody>
            <Row
              label="Right meaning asked first"
              a={`${on.top1Hits}/${on.total} (${pct(on.top1Hits, on.total)})`}
              b={`${off.top1Hits}/${off.total} (${pct(off.top1Hits, off.total)})`}
            />
            <Row
              label="Right meaning within three"
              a={`${on.top3Hits}/${on.total} (${pct(on.top3Hits, on.total)})`}
              b={`${off.top3Hits}/${off.total} (${pct(off.top3Hits, off.total)})`}
            />
            <Row
              label="Context-dependent, first"
              a={`${on.reqContextHitsTop1}/${on.reqContextTotal} (${pct(on.reqContextHitsTop1, on.reqContextTotal)})`}
              b={`${off.reqContextHitsTop1}/${off.reqContextTotal} (${pct(off.reqContextHitsTop1, off.reqContextTotal)})`}
            />
            <Row
              label="Self-contained, first"
              a={`${on.noContextHitsTop1}/${on.noContextTotal} (${pct(on.noContextHitsTop1, on.noContextTotal)})`}
              b={`${off.noContextHitsTop1}/${off.noContextTotal} (${pct(off.noContextHitsTop1, off.noContextTotal)})`}
            />
            <Row
              label="Self-contained, within three"
              a={`${on.noContextHitsTop3}/${on.noContextTotal} (${pct(on.noContextHitsTop3, on.noContextTotal)})`}
              b={`${off.noContextHitsTop3}/${off.noContextTotal} (${pct(off.noContextHitsTop3, off.noContextTotal)})`}
            />
            <Row label="Median time to first question" a={ms(on.p50LatencyMs)} b={ms(off.p50LatencyMs)} />
          </tbody>
        </table>
      </section>

      <section aria-labelledby="lat" className="space-y-2">
        <h2 id="lat" className="font-serif text-[28px]">
          Where the time goes
        </h2>
        <p className="text-[15px] text-muted">
          Memory on. Retrieval is milliseconds; the language model calls dominate.
        </p>
        <table className="w-full">
          <thead>
            <tr className="text-left text-[13px] font-medium text-muted">
              <th className="pb-2 font-medium">Step</th>
              <th className="pb-2 font-medium">Median</th>
              <th className="pb-2 font-medium">Slowest</th>
              <th className="pb-2 font-medium">Runs</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.node} className="border-t border-border">
                <th scope="row" className="py-2 pr-4 text-left font-mono text-[14px] font-normal">
                  {s.node}
                </th>
                <td className="py-2 pr-4 font-mono text-[14px] tabular-nums">{ms(s.p50Ms)}</td>
                <td className="py-2 pr-4 font-mono text-[14px] tabular-nums">{ms(s.maxMs)}</td>
                <td className="py-2 font-mono text-[14px] tabular-nums">{s.count}</td>
              </tr>
            ))}
            <tr className="border-t border-border-strong">
              <th scope="row" className="py-2 pr-4 text-left text-[15px]">
                Whole assist pipeline
              </th>
              <td className="py-2 pr-4 font-mono text-[14px] tabular-nums">{ms(on.p50LatencyMs)}</td>
              <td className="py-2 pr-4" />
              <td className="py-2 text-[14px] text-muted">
                {on.p50LatencyMs < 6000 ? 'under' : 'over'} the 6 s goal
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {learn && (
        <section aria-labelledby="learn" className="space-y-2">
          <h2 id="learn" className="font-serif text-[28px]">
            Learning loop
          </h2>
          <p className="text-[15px] text-muted">
            First-try accuracy on differently phrased fragments, before vs after confirming one example.{' '}
            {learn.results.length} scenarios.
          </p>
          <p className="font-mono text-[15px]">
            before {learn.beforeAcc}% → after {learn.afterAcc}%{' '}
            <span className="text-muted">
              ({learn.provenance.mode}, {learn.provenance.model})
            </span>
          </p>
        </section>
      )}
    </div>
  );
}
