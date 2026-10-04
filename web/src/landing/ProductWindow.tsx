import { useState } from 'react';
import { useScriptedDemo } from './demo';
import { ConversationPanel, HypothesisCards, ReasoningStepper } from '../console/components';
import { memoryHits, type LiveState } from '../console/liveState';
import { Fragment } from '../design/primitives';
import { cn } from '../design/cn';

/** A window frame on a soft warm backdrop. */
export function Frame({
  children,
  className,
  title = 'Unsaid · Live',
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div className={cn('rounded-[20px] bg-warm p-3 sm:p-6', className)}>
      <div className="overflow-hidden rounded-[14px] border border-border bg-canvas shadow-float">
        <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" aria-hidden="true" />
          <span className="ml-3 font-mono text-[12px] text-muted">{title}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The real console components, driven by scripted events instead of the API. */
export function ProductDemo() {
  const [paused, setPaused] = useState(false);
  const { state, pressed } = useScriptedDemo(paused);
  const [hl, setHl] = useState<string | null>(null);
  return (
    <Frame>
      <div
        className="grid grid-cols-1 divide-y divide-border md:grid-cols-[1.1fr_1fr] md:divide-x md:divide-y-0"
        onMouseEnter={() => setPaused(false)}
      >
        <div className="max-h-[520px] min-w-0 overflow-hidden p-5 [mask-image:linear-gradient(to_bottom,black_88%,transparent)]">
          <p className="mb-3 text-[14px] font-medium text-muted">Reasoning</p>
          <DemoReasoning state={state} hl={hl} setHl={setHl} />
        </div>
        <div className="min-w-0 p-5">
          <p className="mb-3 text-[14px] font-medium text-muted">Conversation</p>
          <ConversationPanel
            conf={state.conf}
            fragment={state.fragment}
            thinking={state.thinking}
            onAnswer={() => undefined}
            pressed={pressed ? 'yes' : null}
          />
        </div>
      </div>
      <p className="border-t border-border bg-surface px-4 py-2 text-[13px] text-muted">
        <Fragment className="text-[13px]">scripted example</Fragment> · timings are the median from the latest
        live evaluation
      </p>
    </Frame>
  );
}

function DemoReasoning({
  state,
  hl,
  setHl,
}: {
  state: LiveState;
  hl: string | null;
  setHl: (id: string | null) => void;
}) {
  return (
    <>
      <ReasoningStepper
        steps={state.steps.filter(
          (s) => ['classify', 'retrieve_memory', 'hypothesize'].includes(s.node) || s.status === 'running',
        )}
        thinking={state.thinking}
        classified={state.classified}
        hypCount={state.hypotheses.length}
        highlightId={hl}
        onHighlight={setHl}
        waiting={!!state.fragment}
      />
      <HypothesisCards
        hyps={state.hypotheses}
        hits={memoryHits(state.steps)}
        currentIndex={state.conf?.index}
        highlightId={hl}
        onHighlight={setHl}
      />
    </>
  );
}
