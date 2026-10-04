import { ArrowRight, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ConversationPanel, HypothesisCards, TranscriptFeed } from '../console/components';
import type { ConfView, FeedItem, Hit, HypView } from '../console/liveState';
import { Button, Card, Fragment, Mono, Tag } from '../design/primitives';
import { Frame } from './ProductWindow';

/** Decorative product mockups: inert so they never trap focus or confuse screen readers (the copy beside them says the same). */
export function Mock({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Frame title={title}>
      <div className="p-5" {...{ inert: true }}>
        {children}
      </div>
    </Frame>
  );
}

const FEED: FeedItem[] = [
  {
    kind: 'segment',
    id: '1',
    text: 'Ramesh said he will pay the water bill on Friday.',
    speaker: 'Sunita',
    isUser: false,
    source: 'OMI_REALTIME',
    ts: '',
  },
  {
    kind: 'segment',
    id: '2',
    text: 'Priya is coming on Sunday, she is bringing sweets.',
    speaker: 'Ramesh',
    isUser: false,
    source: 'OMI_REALTIME',
    ts: '',
  },
  {
    kind: 'note',
    id: '3',
    text: 'Remembered: Priya (daughter) is visiting on Sunday morning from Pune',
    ts: '',
  },
  {
    kind: 'segment',
    id: '4',
    text: 'Sunday… Priya… cake… no',
    speaker: 'Patient',
    isUser: true,
    source: 'OMI_REALTIME',
    ts: '',
  },
];
export const ListenMock = () => (
  <Mock title="Transcript · Omi live">
    <TranscriptFeed feed={FEED} />
  </Mock>
);

const FACTS = [
  {
    text: 'Priya (daughter) is visiting on Sunday morning from Pune',
    who: 'Ramesh',
    said: 'Priya is coming on Sunday, she is bringing sweets.',
    when: 'Sat, 4:12 PM',
    tag: 'Events',
  },
  {
    text: 'Dr. Mehta said Papa must strictly avoid sugar, sweets and pastries',
    who: 'Sunita',
    said: 'Doctor Mehta was clear, no sugar, no sweets for Papa.',
    when: 'Thu, 9:40 AM',
    tag: 'Health instructions',
  },
  {
    text: 'Ramesh handles the municipal water bill payment',
    who: 'Sunita',
    said: 'Ramesh said he will pay the water bill on Friday.',
    when: 'Wed, 7:05 PM',
    tag: 'Routines',
  },
];
export const RememberMock = () => (
  <Mock title="Memory">
    <ul className="space-y-3">
      {FACTS.map((f) => (
        <li key={f.text}>
          <Card className="p-4">
            <Tag className="mb-2">{f.tag}</Tag>
            <p className="text-[17px] leading-snug text-ink">{f.text}</p>
            <p className="mt-3 border-t border-border pt-3 text-[14px] text-muted">
              Heard from {f.who}: <span className="text-ink">“{f.said}”</span> <Mono>{f.when}</Mono>
            </p>
          </Card>
        </li>
      ))}
    </ul>
  </Mock>
);

const HITS: Hit[] = [
  { id: 'f1', text: 'Priya (daughter) is visiting on Sunday morning from Pune', score: 0.71 },
  { id: 'f2', text: 'Dr. Mehta said Papa must strictly avoid sugar, sweets and pastries', score: 0.64 },
  { id: 'f3', text: 'Sunita bakes on Saturdays', score: 0.38 },
];
const HYPS: HypView[] = [
  {
    rank: 0,
    intent: '',
    sentence: 'Please tell Priya not to bring cake on Sunday.',
    question: '',
    confidence: 0.62,
    evidenceIds: ['f1', 'f2'],
  },
  {
    rank: 1,
    intent: '',
    sentence: 'Is Priya bringing cake on Sunday?',
    question: '',
    confidence: 0.24,
    evidenceIds: ['f1'],
  },
  {
    rank: 2,
    intent: '',
    sentence: 'We should not bake a cake for Sunday.',
    question: '',
    confidence: 0.14,
    evidenceIds: ['f3'],
  },
];
export const UnderstandMock = () => (
  <Mock title="Reasoning · three meanings">
    <Fragment className="block">Sunday… Priya… cake… no</Fragment>
    <HypothesisCards hyps={HYPS} hits={HITS} />
  </Mock>
);

const CONF: ConfView = {
  id: 'c',
  question: 'Do you want to tell Priya not to bring cake on Sunday?',
  index: 0,
  count: 3,
  status: 'pending',
};
export const ConfirmMock = () => (
  <Mock title="Conversation">
    <ConversationPanel
      conf={CONF}
      fragment="Sunday… Priya… cake… no"
      thinking={false}
      onAnswer={() => undefined}
    />
  </Mock>
);

const ROWS = [
  { said: 'car', meant: 'walk', kind: 'Word', hits: 3 },
  { said: 'Pri', meant: 'Priya', kind: 'Name', hits: 5 },
  { said: 'the thing for eyes', meant: 'reading glasses', kind: 'Phrase', hits: 2 },
];
export const LearnMock = () => (
  <Mock title="Word map">
    <ul className="space-y-2">
      {ROWS.map((r) => (
        <li key={r.said}>
          <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
            <Fragment className="text-[16px]">{r.said}</Fragment>
            <ArrowRight className="h-4 w-4 text-muted" aria-hidden="true" />
            <span className="font-serif text-[24px] leading-none">{r.meant}</span>
            <Tag>{r.kind}</Tag>
            <Mono className="ml-auto">{r.hits} times</Mono>
          </Card>
        </li>
      ))}
    </ul>
    <p className="mt-3 text-[13px] text-muted">Example entries</p>
  </Mock>
);

export const PrivateMock = () => (
  <Mock title="Memory · your control">
    <ul className="space-y-3">
      {FACTS.slice(0, 2).map((f) => (
        <li key={f.text}>
          <Card className="flex items-start justify-between gap-4 p-4">
            <p className="text-[16px] leading-snug text-ink">{f.text}</p>
            <Button variant="ghost" size="sm" tabIndex={-1}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Delete</span>
            </Button>
          </Card>
        </li>
      ))}
    </ul>
    <div className="mt-4 rounded-[14px] border border-[#ecc9c5] bg-danger-soft p-4">
      <p className="font-serif text-[22px]">Erase all memory</p>
      <p className="mt-1 text-[14px] text-ink">Type “erase” to confirm. This cannot be undone.</p>
    </div>
  </Mock>
);
