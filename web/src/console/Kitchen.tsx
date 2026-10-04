import { useState } from 'react';
import {
  Button,
  Card,
  Eyebrow,
  Fragment,
  Kbd,
  LatencyChip,
  Mono,
  Resolved,
  ScoreBar,
  StatusDot,
  Tag,
  Toggle,
  Waveform,
} from '../design/primitives';
import { EmptyState, ErrorState, Skeleton, SkeletonList } from '../design/feedback';
import { ConfirmDialog } from '../design/dialog';
import { ConversationPanel, FactChip, HypothesisCards, ReasoningStepper } from './components';
import type { ConfView, Hit, HypView, StepView } from './liveState';

const hit: Hit = { id: 'a', text: 'Priya (daughter) is visiting on Sunday morning from Pune', score: 0.71 };
const steps: StepView[] = [
  { node: 'classify', status: 'done', latencyMs: 1478 },
  { node: 'retrieve_memory', status: 'done', latencyMs: 18, retrieval: [hit] },
  { node: 'retrieve_wordmap', status: 'skipped' },
  { node: 'hypothesize', status: 'running' },
];
const hyps: HypView[] = [
  {
    rank: 0,
    intent: '',
    sentence: 'Please tell Priya not to bring cake on Sunday.',
    question: '',
    confidence: 0.62,
    evidenceIds: ['a'],
  },
  {
    rank: 1,
    intent: '',
    sentence: 'Is Priya bringing cake on Sunday?',
    question: '',
    confidence: 0.24,
    evidenceIds: [],
  },
];
const pending: ConfView = {
  id: 'c',
  question: 'Do you want to tell Priya not to bring cake on Sunday?',
  index: 0,
  count: 3,
  status: 'pending',
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border py-8">
      <h2 className="text-[14px] font-medium text-muted">{title}</h2>
      {children}
    </section>
  );
}

/** Every design-system component in one place, to check consistency by eye. */
export function Kitchen() {
  const [on, setOn] = useState(true);
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <Eyebrow>kitchen… sink…</Eyebrow>
      <h1 className="font-serif text-[40px]">Components</h1>

      <Block title="Color">
        <div className="flex flex-wrap gap-3">
          {[
            ['canvas', 'bg-canvas'],
            ['surface', 'bg-surface'],
            ['border', 'bg-border'],
            ['ink', 'bg-ink'],
            ['muted', 'bg-muted'],
            ['accent', 'bg-accent'],
            ['accent-soft', 'bg-accent-soft'],
            ['success', 'bg-success'],
            ['danger', 'bg-danger'],
          ].map(([n, c]) => (
            <div key={n} className="w-24">
              <div className={`h-12 rounded-[10px] border border-border ${c}`} />
              <p className="mt-1 font-mono text-[12px] text-muted">{n}</p>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Type: broken → whole">
        <Fragment className="block">Sunday… Priya… cake… no</Fragment>
        <Resolved size="xl">Please tell Priya not to bring cake on Sunday.</Resolved>
        <Resolved size="lg" marked>
          Confirmed sentence with the amber rule
        </Resolved>
        <Resolved size="md">Medium serif sentence</Resolved>
        <p className="text-[16px]">
          Body text, Geist 16px. <Mono>mono 13px · 4821 ms</Mono>
        </p>
      </Block>

      <Block title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
        </div>
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Button size="xl">
            Yes <Kbd>Y</Kbd>
          </Button>
          <Button size="xl" variant="secondary">
            No <Kbd>N</Kbd>
          </Button>
        </div>
      </Block>

      <Block title="Tags, chips, status">
        <div className="flex flex-wrap items-center gap-3">
          <Tag>Neutral</Tag>
          <Tag tone="accent">Asking now</Tag>
          <Tag tone="success">Succeeded</Tag>
          <Tag tone="danger">Failed</Tag>
          <LatencyChip ms={18} />
          <LatencyChip ms={4739} />
          <ScoreBar score={0.71} />
          <span className="flex items-center gap-2 text-[14px]">
            <StatusDot tone="live" pulse /> live
          </span>
          <span className="flex items-center gap-2 text-[14px]">
            <StatusDot tone="sim" /> simulated
          </span>
          <span className="flex items-center gap-2 text-[14px]">
            <StatusDot tone="idle" /> offline
          </span>
          <Toggle
            label="Use personal memory"
            checked={on}
            onChange={setOn}
            labelOn="Memory on"
            labelOff="Memory off"
          />
          <Waveform active /> <Waveform active={false} />
        </div>
      </Block>

      <Block title="Reasoning stepper and fact chips">
        <ReasoningStepper
          steps={steps}
          thinking
          classified={{ kind: 'FRAGMENT', reason: 'Telegraphic speech' }}
        />
        <ul>
          <FactChip hit={hit} highlighted onHighlight={() => undefined} />
        </ul>
      </Block>

      <Block title="Hypotheses">
        <HypothesisCards hyps={hyps} hits={[hit]} currentIndex={1} />
      </Block>

      <Block title="Conversation states">
        <div className="grid gap-8 md:grid-cols-2">
          <ConversationPanel
            conf={pending}
            fragment="Sunday… Priya… cake… no"
            thinking={false}
            onAnswer={() => undefined}
          />
          <ConversationPanel
            conf={{
              ...pending,
              status: 'resolved',
              finalSentence: 'Please tell Priya not to bring cake on Sunday.',
            }}
            fragment="Sunday… Priya… cake… no"
            thinking={false}
            onAnswer={() => undefined}
          />
          <ConversationPanel
            conf={{
              ...pending,
              status: 'unresolved',
              fallbackQuestion: 'Is this about a person, a place, or something you need?',
            }}
            fragment="Sunday… Priya… cake… no"
            thinking={false}
            onAnswer={() => undefined}
          />
          <ConversationPanel
            conf={{ ...pending, status: 'expired', reason: 'timeout' }}
            fragment="Sunday… Priya… cake… no"
            thinking={false}
            onAnswer={() => undefined}
          />
          <ConversationPanel thinking fragment="Sunday… Priya… cake… no" onAnswer={() => undefined} />
          <ConversationPanel thinking={false} onAnswer={() => undefined} />
        </div>
      </Block>

      <Block title="Feedback: skeleton, empty, error, dialog">
        <Skeleton className="h-10 w-64" />
        <SkeletonList rows={2} />
        <EmptyState
          fragment="nothing… here…"
          title="Nothing here yet"
          body="An empty screen says what belongs here and what to do next."
          action={<Button variant="secondary">Do the thing</Button>}
        />
        <ErrorState
          title="Could not load memory"
          detail="Cannot reach the API."
          fix="Start the backend and reload."
          onRetry={() => undefined}
        />
        <Card className="p-4">
          <Button variant="danger" onClick={() => setOpen(true)}>
            Open dialog
          </Button>
        </Card>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Delete this memory?"
          description="Priya (daughter) is visiting on Sunday morning."
          confirmLabel="Delete memory"
          onConfirm={() => setOpen(false)}
        />
      </Block>
    </div>
  );
}
