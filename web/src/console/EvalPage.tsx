import evalReport from '../generated/eval.json';
import learnReport from '../generated/learn.json';
import { Chip, Mono } from '../design/primitives';
import { ms } from './format';
import { PageHeader } from './PageHeader';
import { BigRatio, evalFacts, type Mode, type Report } from '../landing/evalData';

const report = evalReport as unknown as Report;
const learn = learnReport as unknown as {
  provenance: { mode: string; model: string };
  beforeAcc: number;
  afterAcc: number;
  results: unknown[];
} | null;

const delta = (a: number, b: number) => (a - b > 0 ? `+${a - b}` : String(a - b));

function Compare({ rows, f }: { rows: Array<[string, string, (m: Mode) => number, number]>; f: ReturnType<typeof evalFacts> }) {
  return (
    <table className="w-full border-collapse text-[14px]">
      <thead>
        <tr className="border-b border-line-strong text-[12px] text-faint">
          <th scope="col" className="px-3 py-2.5 text-left font-medium">Measure</th>
          <th scope="col" className="px-3 py-2.5 text-right font-medium">Memory on</th>
          <th scope="col" className="px-3 py-2.5 text-right font-medium">Memory off</th>
          <th scope="col" className="px-3 py-2.5 text-right font-medium">Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([a, b, get, n]) => {
          const on = get(f.on);
          const off = get(f.off);
          return (
            <tr key={a + b} className="border-t border-line first:border-t-0">
              <th scope="row" className="px-3 py-3 text-left font-normal">
                <span className="block font-medium">{a}</span>
                <span className="block text-[12.5px] text-faint">{b}</span>
              </th>
              <td className="mono px-3 py-3 text-right tabular-nums">
                {on}
                <span className="text-faint"> / {n}</span>
              </td>
              <td className="mono px-3 py-3 text-right tabular-nums">
                {off}
                <span className="text-faint"> / {n}</span>
              </td>
              <td className={`mono px-3 py-3 text-right tabular-nums ${on > off ? 'text-ink' : 'text-faint'}`}>{delta(on, off)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function EvalPage() {
  const f = evalFacts(report);
  const steps = Object.values(f.on.stepStats).filter((s) => s.count > 0);
  const offBy = f.off.stepStats;
  const maxP50 = Math.max(1, ...steps.map((s) => s.p50Ms));
  const stamp: Array<[string, string]> = [
    ['mode', f.live ? 'live' : 'mock'],
    ['provider', f.provider],
    ['model', f.model],
    ['judge', f.judge],
    ['n', String(f.n)],
    ['run', new Date(f.timestamp).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'],
  ];
  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-12 sm:px-10">
      <PageHeader
        title="Eval"
        sub="Memory on versus memory off, on the same synthetic fragments. The latest live run of pnpm eval."
        right={<Chip tone={f.live ? 'neutral' : 'danger'}>{f.live ? 'Live run' : 'Mock run (smoke test)'}</Chip>}
      />

      <section aria-labelledby="ctx" className="grid gap-8 border-y border-line py-7 md:grid-cols-[1fr_1fr_300px]">
        <h2 id="ctx" className="sr-only">Resolved within three yes/no questions</h2>
        <BigRatio label="Memory on" hits={f.onHits} total={f.ctxTotal} strong size="md" />
        <BigRatio label="Memory off" hits={f.offHits} total={f.ctxTotal} size="md" />
        <p className="text-[13px] leading-relaxed text-muted">
          Context-dependent fragments resolved within three yes/no questions. {f.firstQuestionNote}
        </p>
      </section>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_440px]">
        <section aria-labelledby="cmp">
          <h2 id="cmp" className="sr-only">On versus off</h2>
          <Compare
            f={f}
            rows={[
              ['Resolved within 3 questions', `Context-dependent · n=${f.ctxTotal}`, (m) => m.reqContextHitsTop3, f.ctxTotal],
              ['Resolved within 3 questions', `All fragments · n=${f.n}`, (m) => m.top3Hits, f.n],
              ['Resolved at first question', `Context-dependent · n=${f.ctxTotal}`, (m) => m.reqContextHitsTop1, f.ctxTotal],
              ['Resolved at first question', `All fragments · n=${f.n}`, (m) => m.top1Hits, f.n],
              ['Resolved within 3 questions', `Context-free · n=${f.noCtxTotal}`, (m) => m.noContextHitsTop3, f.noCtxTotal],
            ]}
          />
          <p className="mono mt-3 px-3 text-[12px] text-faint">
            median time to first question: {ms(f.on.p50LatencyMs)} on · {ms(f.off.p50LatencyMs)} off
          </p>
        </section>
        <section aria-labelledby="lat">
          <h2 id="lat" className="sr-only">Per-step latency</h2>
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line-strong text-[12px] text-faint">
                <th scope="col" className="px-3 py-2.5 text-left font-medium">Step · median</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">On</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Off</th>
                <th scope="col" className="w-24 px-3 py-2.5"><span className="sr-only">Share</span></th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.node} className="border-t border-line first:border-t-0">
                  <th scope="row" className="mono px-3 py-2.5 text-left text-[12.5px] font-normal">{s.node}</th>
                  <td className="mono px-3 py-2.5 text-right tabular-nums">{ms(s.p50Ms)}</td>
                  <td className="mono px-3 py-2.5 text-right tabular-nums text-muted">
                    {offBy[s.node] ? ms(offBy[s.node].p50Ms) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block h-[3px] overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                      <span className="block h-full bg-muted" style={{ width: `${Math.max(2, (s.p50Ms / maxP50) * 100)}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <dl className="mono mt-8 flex flex-wrap gap-x-7 gap-y-2 rounded-[10px] border border-line-strong px-4 py-3.5 text-[11.5px]">
        {stamp.map(([k, v]) => (
          <div key={k} className="flex gap-1.5">
            <dt className="text-faint">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {learn && (
        <p className="mt-6 text-[13px] text-muted">
          Learning loop: first-try accuracy before {learn.beforeAcc}% → after {learn.afterAcc}% across {learn.results.length}{' '}
          scenarios <Mono>({learn.provenance.mode}, {learn.provenance.model})</Mono>.
        </p>
      )}
    </div>
  );
}
