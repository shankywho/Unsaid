import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useRun, useRuns } from '../api/hooks';
import { errMessage } from '../api/client';
import { usePatient } from './patient';
import { Fragment, Mono, Resolved, Tag, fmtMs } from '../design/primitives';
import { EmptyState, ErrorState, SkeletonList } from '../design/feedback';
import { cn } from '../design/cn';
import { PageHeader } from './PageHeader';
import { fmtTime } from './format';
import { fromRun, memoryHits } from './liveState';
import { ReasoningTimeline, traceTotalMs } from './components';

const statusLabel = (s: string) =>
  ({
    SUCCEEDED: 'Succeeded',
    FAILED: 'Failed',
    RUNNING: 'Running',
    AWAITING_CONFIRMATION: 'Awaiting answer',
  })[s] ?? s;

export function Runs() {
  const { patient } = usePatient();
  const runs = useRuns(patient?.id);
  const [kind, setKind] = useState<'ASSIST' | 'INGEST' | 'LEARN' | 'ALL'>('ASSIST');
  const shown = runs.data?.filter((r) => kind === 'ALL' || r.pipeline === kind);
  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-12 sm:px-10">
      <PageHeader
        title="Runs"
        sub="Each fragment, memory update and learning pass leaves a full trace you can open."
        right={
          <div className="flex gap-1.5" role="group" aria-label="Filter runs">
            {(['ASSIST', 'LEARN', 'INGEST', 'ALL'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`h-7 rounded-[6px] border px-2.5 text-[12px] font-medium ${kind === k ? 'border-line-strong bg-white/[0.07] text-ink' : 'border-transparent text-muted hover:text-ink'}`}
              >
                {k === 'ALL' ? 'All' : k[0] + k.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        }
      />
      {runs.isLoading && <SkeletonList label="Loading runs" />}
      {runs.isError && (
        <ErrorState
          title="Could not load runs"
          detail={errMessage(runs.error)}
          onRetry={() => runs.refetch()}
        />
      )}
      {runs.isSuccess && (shown?.length ?? 0) === 0 && (
        <EmptyState
          title="No runs yet"
          body="Send a fragment from the Live screen and its trace will appear here."
          action={
            <Link to="/app/live" className="text-[14px] font-medium underline underline-offset-4">
              Go to Live
            </Link>
          }
        />
      )}
      <ul className="overflow-hidden rounded-[10px] border border-line-strong empty:hidden">
        {shown?.map((r) => {
          const input = (r.input ?? {}) as Record<string, unknown>;
          const label =
            typeof input.text === 'string'
              ? input.text
              : typeof input.fragment === 'string'
                ? input.fragment
                : null;
          return (
            <li key={r.id} className="border-t border-line first:border-t-0">
              <Link
                to={r.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-white/[0.03] focus-visible:outline-offset-[-2px]"
              >
                <Tag className="mono">{r.pipeline}</Tag>
                {label ? (
                  <Fragment className="min-w-0 truncate">{label}</Fragment>
                ) : (
                  <span className="text-[14px] text-muted">Household conversation</span>
                )}
                <span className="flex items-center gap-4">
                  <span
                    className={cn(
                      'hidden text-[13px] sm:inline',
                      r.status === 'FAILED' ? 'text-danger' : 'text-muted',
                    )}
                  >
                    {statusLabel(r.status)}
                  </span>
                  <Mono>{r._count.steps} steps</Mono>
                  <Mono className="hidden md:inline">{fmtTime(r.startedAt)}</Mono>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RunPage() {
  const { id } = useParams();
  const run = useRun(id);
  const view = run.data ? fromRun(run.data) : null;
  const output = (run.data?.output ?? {}) as Record<string, unknown>;
  const total = view ? traceTotalMs(view.steps) : undefined;
  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-12 pt-8 sm:px-10">
      <Link to="/app/runs" className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All runs
      </Link>
      {run.isLoading && (
        <div className="mt-6">
          <SkeletonList label="Loading trace" />
        </div>
      )}
      {run.isError && (
        <ErrorState
          title="Could not load this run"
          detail={errMessage(run.error)}
          onRetry={() => run.refetch()}
        />
      )}
      {run.data && view && (
        <>
          <header className="mt-5 flex flex-wrap items-start justify-between gap-6 pb-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <Tag className="mono">{run.data.pipeline}</Tag>
                <Mono>{run.data.id}</Mono>
                <Mono>{fmtTime(run.data.startedAt)}</Mono>
                <Tag>{run.data.contextUsed ? 'Memory on' : 'Memory off'}</Tag>
                <span className="text-[13px] text-muted">{statusLabel(run.data.status)}</span>
              </div>
              {view.fragment && <Fragment className="block pt-4 text-[17px]">{view.fragment}</Fragment>}
              {typeof output.finalSentence === 'string' && (
                <Resolved size="md" className="mt-2.5">
                  {output.finalSentence}
                </Resolved>
              )}
            </div>
            {total !== undefined && (
              <div className="text-right">
                <p className="mono text-[28px] tracking-[-0.03em]">{fmtMs(total)}</p>
                <p className="text-[13px] text-faint">end to end</p>
              </div>
            )}
          </header>
          <h2 className="text-[13px] font-medium text-muted">Trace</h2>
          {run.data.pipeline === 'ASSIST' ? (
            <ReasoningTimeline
              steps={view.steps}
              thinking={false}
              hyps={view.hypotheses}
              hits={memoryHits(view.steps)}
              conf={undefined}
            />
          ) : (
            <ol className="mt-1">
              {view.steps.map((s) => (
                <li
                  key={s.node}
                  className="flex items-center justify-between gap-4 border-t border-line py-2.5 first:border-t-0"
                >
                  <span className="text-[14px] font-medium">{s.node}</span>
                  <span className="flex items-center gap-3">
                    {s.service && (
                      <Tag>{`${s.service.provider} · ${s.service.name.replace(/^(test_)?unsaid_/, '')}`}</Tag>
                    )}
                    <Mono>{s.latencyMs !== undefined ? fmtMs(s.latencyMs) : ''}</Mono>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
