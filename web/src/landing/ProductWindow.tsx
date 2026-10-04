import { useState } from 'react';
import { useScriptedDemo, DEMO_PATIENT } from './demo';
import { ConversationPanel, ReasoningTimeline, TranscriptFeed, traceTotalMs } from '../console/components';
import { memoryHits } from '../console/liveState';
import { Chip, Fragment, StatusDot, Switch, Wordmark, fmtMs } from '../design/primitives';

/** The real console components, driven by scripted events instead of the API. */
export function ProductDemo() {
  const { state, pressed } = useScriptedDemo();
  const [hl, setHl] = useState<string | null>(null);
  const total = traceTotalMs(state.steps);
  return (
    <div className="mx-auto w-full max-w-[1120px] overflow-hidden rounded-[10px] border border-line-strong bg-surface shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)]">
      <div className="flex h-12 items-center gap-3 border-b border-line px-4 text-[12px] text-muted">
        <Wordmark size={15} />
        <span className="text-ghost">/</span>
        <span className="text-ink">Live</span>
        <span className="ml-3 hidden items-center gap-2 rounded-[8px] border border-line-strong px-2 py-1 sm:inline-flex">
          <span className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-raised text-[11px] font-semibold text-ink">
            {DEMO_PATIENT[0]}
          </span>
          <span className="text-[13px] font-medium text-ink">{DEMO_PATIENT}</span>
        </span>
        <span className="hidden items-center gap-2 md:inline-flex">
          <Switch label="Memory (scripted example)" checked onChange={() => undefined} disabled />
          <span className="text-[13px] font-medium text-ink">Memory</span>
        </span>
        <span className="mono ml-auto hidden text-faint sm:inline">scripted example</span>
        <Chip tone="live">
          <StatusDot tone="live" pulse /> Omi live
        </Chip>
      </div>
      <div className="grid min-h-[700px] grid-cols-1 divide-y divide-line md:grid-cols-[260px_minmax(0,1fr)_340px] md:divide-x md:divide-y-0">
        <section
          aria-label="Transcript (scripted example)"
          className="hidden max-h-[700px] overflow-hidden px-5 md:block"
        >
          <p className="flex h-[52px] items-center text-[13px] font-medium text-muted">Transcript</p>
          <TranscriptFeed feed={state.feed} patientName={DEMO_PATIENT} />
        </section>
        <section
          aria-label="Reasoning (scripted example)"
          className="max-h-[700px] overflow-hidden px-5 [mask-image:linear-gradient(to_bottom,black_92%,transparent)]"
        >
          <div className="flex h-[52px] items-center justify-between">
            <p className="text-[13px] font-medium text-muted">Reasoning</p>
            <span className="mono text-[12px] text-faint">
              {total !== undefined ? fmtMs(total) : state.thinking ? 'running' : 'idle'}
            </span>
          </div>
          <ReasoningTimeline
            steps={state.steps}
            thinking={state.thinking}
            classified={state.classified}
            hyps={state.hypotheses}
            hits={memoryHits(state.steps)}
            conf={state.conf}
            learn={state.learn}
            highlightId={hl}
            onHighlight={setHl}
          />
        </section>
        <section aria-label="Conversation (scripted example)" className="relative px-5 pb-8">
          <p className="flex h-[52px] items-center text-[13px] font-medium text-muted">Conversation</p>
          {state.conf?.status === 'resolved' && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-6 top-20 h-[420px] bg-[radial-gradient(closest-side,rgba(94,234,212,0.15),transparent)]"
            />
          )}
          <div className="relative">
            <ConversationPanel
              conf={state.conf}
              fragment={state.fragment}
              thinking={state.thinking}
              onAnswer={() => undefined}
              patientName={DEMO_PATIENT}
              learn={state.learn}
              pressed={pressed ? 'yes' : null}
              ellapsedHint="Timings are the median from the latest live evaluation."
            />
          </div>
        </section>
      </div>
      <p className="border-t border-line px-4 py-2 text-[12px] text-faint">
        <Fragment className="text-[12px] text-faint">scripted example</Fragment> · timings are the median from
        the latest live evaluation
      </p>
    </div>
  );
}
