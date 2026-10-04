import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useRun, useRuns } from '../api/hooks';
import { errMessage } from '../api/client';
import { usePatient } from './patient';
import { Card, Fragment, Mono, Resolved, Tag } from '../design/primitives';
import { EmptyState, ErrorState, SkeletonList } from '../design/feedback';
import { fmtTime } from './format';
import { fromRun, memoryHits } from './liveState';
import { HypothesisCards, ReasoningStepper } from './components';

const tone = (s: string) =>
  s === 'SUCCEEDED'
    ? 'success'
    : s === 'FAILED'
      ? 'danger'
      : s === 'AWAITING_CONFIRMATION'
        ? 'accent'
        : 'neutral';
const statusLabel = (s: string) =>
  ({
    SUCCEEDED: 'Succeeded',
    FAILED: 'Failed',
    RUNNING: 'Running',
    AWAITING_CONFIRMATION: 'Awaiting answer',
  })[s] ?? s;
const pipelineLabel = (p: string) => ({ ASSIST: 'Assist', INGEST: 'Remember', LEARN: 'Learn' })[p] ?? p;

export function Runs() {
  const { patient } = usePatient();
  const runs = useRuns(patient?.id);
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-5 py-8">
      <header className="space-y-1">
        <Fragment>every… step… recorded…</Fragment>
        <h1 className="font-serif text-[40px] leading-tight">Runs</h1>
        <p className="max-w-xl text-[16px] text-muted">
          Each fragment, memory update and learning pass leaves a full trace you can open.
        </p>
      </header>
      {runs.isLoading && <SkeletonList label="Loading runs" />}
      {runs.isError && (
        <ErrorState
          title="Could not load runs"
          detail={errMessage(runs.error)}
          onRetry={() => runs.refetch()}
        />
      )}
      {runs.isSuccess && runs.data.length === 0 && (
        <EmptyState
          fragment="no… runs… yet…"
          title="No runs yet"
          body="Send a fragment from the Live screen and its trace will appear here."
          action={
            <Link to="/app/live" className="font-medium underline underline-offset-4">
              Go to Live
            </Link>
          }
        />
      )}
      <ul className="space-y-2">
        {runs.data?.map((r) => {
          const input = (r.input ?? {}) as Record<string, unknown>;
          const label =
            typeof input.text === 'string'
              ? input.text
              : typeof input.fragment === 'string'
                ? input.fragment
                : null;
          return (
            <li key={r.id}>
              <Link to={r.id} className="block rounded-[14px] focus-visible:outline-offset-4">
                <Card className="flex flex-wrap items-center gap-3 p-4 transition-colors duration-150 hover:bg-surface">
                  <Tag>{pipelineLabel(r.pipeline)}</Tag>
                  {label ? (
                    <Fragment className="min-w-0 flex-1 truncate">{label}</Fragment>
                  ) : (
                    <span className="flex-1 text-[15px] text-muted">Household conversation</span>
                  )}
                  <Tag tone={tone(r.status)}>{statusLabel(r.status)}</Tag>
                  <Mono>{r._count.steps} steps</Mono>
                  <Mono>{fmtTime(r.startedAt)}</Mono>
                </Card>
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
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <Link to="/app/runs" className="inline-flex items-center gap-1.5 text-[15px] text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All runs
      </Link>
      {run.isLoading && <SkeletonList label="Loading trace" />}
      {run.isError && (
        <ErrorState
          title="Could not load this run"
          detail={errMessage(run.error)}
          onRetry={() => run.refetch()}
        />
      )}
      {run.data && view && (
        <>
          <header className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Tag>{pipelineLabel(run.data.pipeline)}</Tag>
              <Tag tone={tone(run.data.status)}>{statusLabel(run.data.status)}</Tag>
              <Tag>{run.data.contextUsed ? 'Memory on' : 'Memory off'}</Tag>
              <Mono>{fmtTime(run.data.startedAt)}</Mono>
              <Mono>{run.data.id}</Mono>
            </div>
            {view.fragment && <Fragment className="block text-[16px]">{view.fragment}</Fragment>}
            {typeof output.finalSentence === 'string' && (
              <Resolved size="lg" marked>
                {output.finalSentence}
              </Resolved>
            )}
          </header>
          <ReasoningStepper steps={view.steps} thinking={false} hypCount={view.hypotheses.length} />
          <HypothesisCards hyps={view.hypotheses} hits={memoryHits(view.steps)} />
        </>
      )}
    </div>
  );
}
