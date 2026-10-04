import { useState } from 'react';
import {
  Button,
  Chip,
  Fragment,
  Kbd,
  Resolved,
  Select,
  StatusDot,
  Switch,
  Tag,
  Wordmark,
  inputClass,
} from '../design/primitives';
import { EmptyState, ErrorState, SkeletonList } from '../design/feedback';
import { ConversationPanel, FactRow, HypothesisList, ReasoningTimeline } from './components';
import type { ConfView, Hit, HypView, StepView } from './liveState';

const hits: Hit[] = [
  { id: 'a', type: 'event', text: 'Priya (daughter) is visiting on Sunday morning from Pune', score: 0.71 },
  {
    id: 'b',
    type: 'health_instruction',
    text: 'Dr. Mehta said Papa must strictly avoid sugar, sweets and pastries',
    score: 0.64,
  },
];
const steps: StepView[] = [
  {
    node: 'classify',
    status: 'done',
    latencyMs: 1478,
    startOffsetMs: 0,
    service: { provider: 'lyzr', name: 'utterance_classifier' },
  },
  {
    node: 'fragment_analyze',
    status: 'done',
    latencyMs: 2280,
    startOffsetMs: 4,
    service: { provider: 'lyzr', name: 'fragment_analyst' },
  },
  {
    node: 'retrieve_raw_memory',
    status: 'done',
    latencyMs: 13,
    startOffsetMs: 6,
    service: { provider: 'qdrant', name: 'unsaid_memory' },
  },
  { node: 'retrieve_wordmap', status: 'skipped', startOffsetMs: 6 },
  {
    node: 'retrieve_memory',
    status: 'done',
    latencyMs: 18,
    startOffsetMs: 2290,
    service: { provider: 'qdrant', name: 'unsaid_memory' },
    retrieval: hits,
  },
  { node: 'hypothesize', status: 'running', startOffsetMs: 2320 },
];
const hyps: HypView[] = [
  {
    rank: 0,
    intent: '',
    sentence: 'Please tell Priya not to bring cake on Sunday.',
    question: '',
    confidence: 0.62,
    evidenceIds: ['a', 'b'],
  },
  {
    rank: 1,
    intent: '',
    sentence: 'Is Priya bringing cake on Sunday?',
    question: '',
    confidence: 0.24,
    evidenceIds: ['a'],
  },
];
const pending: ConfView = {
  id: 'c',
  question: 'Do you want to tell Priya not to bring cake on Sunday?',
  index: 0,
  count: 3,
  status: 'pending',
};

const COLORS: Array<[string, string]> = [
  ['canvas', '#0A0A0B'],
  ['surface', '#111113'],
  ['raised', '#17171A'],
  ['ink', '#EDEDEF'],
  ['muted', '#8B8B93'],
  ['faint', '#84848C'],
  ['ghost', '#5A5A62'],
  ['accent', '#5EEAD4'],
  ['danger', '#F28B82'],
];

function Block({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-line py-10 md:grid-cols-[240px_1fr] md:gap-12">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.025em]">{title}</h2>
        <p className="mt-2 max-w-[230px] text-[14px] text-muted">{desc}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function Kitchen() {
  const [on, setOn] = useState(true);
  const [sel, setSel] = useState('a');
  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-16 pt-10 sm:px-10">
      <Wordmark size={26} />
      <h1 className="mt-6 text-[48px] font-semibold leading-[1.05] tracking-[-0.04em]">Design system</h1>
      <p className="mt-3 max-w-xl text-[19px] text-muted">
        Dark, quiet and grayscale. One mint accent that means something is live, being asked or confirmed.
      </p>

      <Block title="Color" desc="Surfaces, lines, text and one accent.">
        <ul className="grid grid-cols-3 gap-4 sm:grid-cols-5">
          {COLORS.map(([n, hex]) => (
            <li key={n}>
              <div className="h-14 rounded-[8px] border border-line-strong" style={{ background: hex }} />
              <p className="mt-2 text-[13px] font-medium">{n}</p>
              <p className="mono text-[11.5px] text-faint">{hex}</p>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Type" desc="Geist for everything, Geist Mono for fragments and data. No serif.">
        <div className="space-y-4">
          <p className="text-[52px] font-semibold leading-none tracking-[-0.045em]">
            Finishing the sentences
          </p>
          <p className="text-[32px] font-semibold tracking-[-0.03em]">Every fact is visible</p>
          <p className="text-[15px]">Unsaid asks one yes/no question at a time.</p>
          <p className="text-[13px] text-muted">Saved for next time in the Sunday context.</p>
          <Fragment className="block text-[16px]">Sunday… Priya… cake… no</Fragment>
          <Resolved size="xl" glow>
            Please tell Priya not to bring cake on Sunday.
          </Resolved>
          <p className="mono text-[12px] text-muted">18 ms · 0.71 · run_8f2a91</p>
        </div>
      </Block>

      <Block title="Buttons" desc="Primary is light on dark, never the accent.">
        <div className="flex flex-wrap items-center gap-4">
          <Button>Open console</Button>
          <Button variant="secondary">Send</Button>
          <Button variant="ghost">View on GitHub</Button>
          <Button variant="danger">Purge all</Button>
          <Button disabled>Disabled</Button>
          <Button size="lg">Watch the demo</Button>
        </div>
      </Block>

      <Block title="Controls" desc="A real switch and a custom select, no native chrome.">
        <div className="flex flex-wrap items-start gap-12">
          <label className="inline-flex items-center gap-2.5 text-[14px] font-medium">
            <Switch label="Memory" checked={on} onChange={setOn} /> Memory{' '}
            <span className="mono text-[11px] text-faint">{on ? 'ON' : 'OFF'}</span>
          </label>
          <Select
            label="Patient"
            value={sel}
            onChange={setSel}
            className="w-56"
            options={[
              { value: 'a', label: 'Mohan Lal Sharma' },
              { value: 'b', label: 'Second patient' },
            ]}
          />
          <div className="w-64">
            <label htmlFor="k-in" className="sr-only">
              Example input
            </label>
            <input id="k-in" className={inputClass} placeholder="Search facts" />
          </div>
        </div>
      </Block>

      <Block title="Chips and status" desc="Omi status lives in one chip: live, simulated or offline.">
        <div className="flex flex-wrap items-center gap-4">
          <Chip>Assist</Chip>
          <Tag>request</Tag>
          <Chip tone="live">Spoken to caregiver</Chip>
          <Chip tone="live">
            <StatusDot tone="live" pulse /> Omi live <span className="mono">35s ago</span>
          </Chip>
          <Chip>
            <StatusDot tone="sim" /> Simulated
          </Chip>
          <Chip tone="danger">
            <StatusDot tone="danger" /> Omi offline
          </Chip>
        </div>
      </Block>

      <Block title="Rows" desc="The ASSIST DAG as a timeline, facts and hypotheses as rows. No nested cards.">
        <div className="grid gap-10 md:grid-cols-2">
          <ReasoningTimeline steps={steps} thinking hyps={[]} hits={hits} />
          <div>
            <ul>
              {hits.map((h, i) => (
                <FactRow key={h.id} hit={h} index={i} />
              ))}
            </ul>
            <div className="mt-6">
              <HypothesisList hyps={hyps} hits={hits} currentIndex={0} />
            </div>
          </div>
        </div>
      </Block>

      <Block
        title="Answer and sentence"
        desc="Large, equal-weight YES and NO. The confirmed sentence is the brightest thing on screen."
      >
        <div className="grid max-w-3xl gap-10 md:grid-cols-2">
          <ConversationPanel
            conf={pending}
            fragment="Sunday… Priya… cake… no"
            thinking={false}
            onAnswer={() => undefined}
            patientName="Patient"
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
            patientName="Patient"
            learn={{ status: 'queued' }}
          />
        </div>
        <p className="mt-6 flex items-center gap-2 text-[13px] text-muted">
          Keyboard: <Kbd>Y</Kbd> yes <Kbd>N</Kbd> no
        </p>
      </Block>

      <Block title="Empty, loading, error" desc="Every screen has all three.">
        <div className="grid gap-8 md:grid-cols-3">
          <EmptyState
            title="Nothing remembered yet"
            body="Facts appear as Unsaid hears the household talk."
          />
          <SkeletonList rows={3} label="Loading example" />
          <ErrorState
            title="Couldn’t load memory"
            detail="Nothing has been changed."
            requestId="3c71d0e2"
            onRetry={() => undefined}
          />
        </div>
      </Block>
    </div>
  );
}
