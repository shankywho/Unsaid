import { Link } from 'react-router-dom';
import { Plus, Play, Star, Trash2 } from 'lucide-react';
import evalReport from '../generated/eval.json';
import { Button, Fragment, Kbd, Resolved, Tag, Waveform, Wordmark } from '../design/primitives';
import { cn } from '../design/cn';
import { ProductDemo } from './ProductWindow';
import { AMBIENT, DEMO_PATIENT, HITS, HYPS } from './demo';
import { FactRow, HypothesisList, TranscriptFeed } from '../console/components';
import { BigRatio, evalFacts, type Report } from './evalData';
import { DEMO_VIDEO_URL, GITHUB_URL, embedUrl } from './site';

const report = evalReport as unknown as Report;
const facts = evalFacts(report);
const stars: string | undefined = import.meta.env.VITE_GITHUB_STARS;
const wrap = 'mx-auto w-full max-w-[1200px] px-5 sm:px-10';
const FRAG = 'Sunday… Priya… cake… no';
const H2 = 'text-[32px] font-semibold leading-[1.1] tracking-[-0.035em] sm:text-[48px] sm:tracking-[-0.04em]';

function Nav() {
  return (
    <header className="relative z-20">
      <div className={cn(wrap, 'flex h-16 items-center justify-between')}>
        <a href="/" aria-label="Unsaid home">
          <Wordmark size={22} />
        </a>
        <nav
          aria-label="Primary"
          className="hidden items-center gap-7 text-[14px] font-medium text-muted sm:flex"
        >
          <a href="#how" className="hover:text-ink">
            How it works
          </a>
          <a href="#demo" className="hover:text-ink">
            Demo
          </a>
          <a href={GITHUB_URL} className="hover:text-ink">
            GitHub
          </a>
        </nav>
        <Link to="/app/live">
          <Button size="sm">Open console</Button>
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pb-20 pt-14 sm:pt-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[360px] h-[620px] w-[1200px] max-w-none -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(94,234,212,0.2),rgba(94,234,212,0.05)_55%,transparent)] blur-[30px]"
      />
      <div className={cn(wrap, 'text-center')}>
        <h1 className="mx-auto max-w-[960px] text-[42px] font-semibold leading-none tracking-[-0.045em] sm:text-[76px]">
          Finishing the sentences aphasia takes away.
        </h1>
        <p className="mx-auto mt-6 max-w-[600px] text-[17px] leading-normal text-muted sm:text-[19px]">
          Unsaid turns a few broken words into the sentence a stroke survivor meant. They confirm it with a
          yes, and it is spoken aloud.
        </p>
        <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
          <a href="#demo">
            <Button size="lg" className="w-full">
              Watch the demo
            </Button>
          </a>
          <a href={GITHUB_URL}>
            <Button size="lg" variant="ghost" className="w-full">
              <Star className="h-4 w-4" aria-hidden="true" /> View on GitHub
              {stars && (
                <span className="mono border-l border-line-strong pl-2.5 text-[12px] text-muted">
                  {stars}
                </span>
              )}
            </Button>
          </a>
        </div>
      </div>
      <div className={cn(wrap, 'relative mt-16')}>
        <ProductDemo />
      </div>
    </section>
  );
}

function BuiltWith() {
  return (
    <section aria-label="Built with" className={cn(wrap, 'mt-6')}>
      <ul className="grid border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-line">
        {[
          ['Omi', 'listens'],
          ['Qdrant', 'remembers'],
          ['Lyzr', 'reasons'],
        ].map(([n, r]) => (
          <li
            key={n}
            className="flex items-baseline justify-between border-t border-line py-6 first:border-t-0 sm:border-t-0 sm:px-10 sm:first:pl-0"
          >
            <span className="text-[28px] font-semibold tracking-[-0.04em] text-muted">{n}</span>
            <span className="text-[13px] text-faint">{r}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---- small crops of the console, built from the real row components ---- */
function Crop({ title, children, pad = true }: { title: string; children: React.ReactNode; pad?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-line-strong bg-surface">
      <div className="flex h-10 items-center border-b border-line px-4 text-[12px] text-ink">{title}</div>
      <div className={pad ? 'px-5' : ''}>{children}</div>
    </div>
  );
}

const STEPS: Array<{ id: string; title: string; body: string; crop: React.ReactNode }> = [
  {
    id: 'listen',
    title: 'Listen',
    body: 'An Omi wearable or the Omi phone app streams everyday household conversation to Unsaid as text, in real time.',
    crop: (
      <Crop title="Transcript">
        <TranscriptFeed
          patientName={DEMO_PATIENT}
          feed={[
            ...AMBIENT,
            {
              kind: 'segment',
              id: 'p',
              text: FRAG,
              isUser: true,
              source: 'OMI_REALTIME',
              ts: '2026-10-04T10:39:26',
            },
          ]}
        />
      </Crop>
    ),
  },
  {
    id: 'remember',
    title: 'Remember',
    body: 'Facts like who is visiting and what the doctor said are pulled out and stored as personal memory in Qdrant, with where and when they were heard.',
    crop: (
      <Crop title="Memory · matched facts">
        <ul>
          {HITS.map((h, i) => (
            <FactRow key={h.id} hit={h} index={i} />
          ))}
        </ul>
      </Crop>
    ),
  },
  {
    id: 'understand',
    title: 'Understand',
    body: 'When a fragment arrives, Lyzr agents search that memory and propose the three most likely meanings, ranked, each tied to its evidence.',
    crop: (
      <Crop title="Ranked meanings">
        <HypothesisList hyps={HYPS} hits={HITS} currentIndex={0} />
      </Crop>
    ),
  },
  {
    id: 'confirm',
    title: 'Confirm',
    body: 'Unsaid asks one yes/no question at a time. The patient answers with a button or a word, and the confirmed sentence is spoken aloud.',
    crop: (
      <div className="rounded-[10px] border border-line-strong bg-surface p-7">
        <Fragment className="block pb-5 text-[15px]">{FRAG}</Fragment>
        <p className="mono mb-3 text-[12px] text-muted">Question 1 of 3</p>
        <p className="text-[26px] font-medium leading-[1.18] tracking-[-0.035em]">{HYPS[0].question}</p>
        <div className="my-5 flex">
          <Waveform active={false} bars={20} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex h-[76px] items-center justify-center gap-3 rounded-[10px] border border-line-strong bg-raised text-[20px] font-semibold">
            Yes <Kbd>Y</Kbd>
          </div>
          <div className="flex h-[76px] items-center justify-center gap-3 rounded-[10px] border border-line-strong bg-raised text-[20px] font-semibold">
            No <Kbd>N</Kbd>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'learn',
    title: 'Learn',
    body: 'Each confirmation teaches Unsaid how this person speaks, so the same fragment is easier to understand next time.',
    crop: (
      <Crop title="Word map" pad={false}>
        <table className="w-full text-[14px]">
          <caption className="sr-only">Learned words</caption>
          <tbody>
            {[
              ['cake… no', 'Please tell Priya not to bring cake on Sunday.'],
              ['paani', 'water'],
              ['bill', 'the water bill'],
            ].map(([a, b]) => (
              <tr key={a} className="border-t border-line first:border-t-0">
                <td className="w-[38%] px-4 py-3">
                  <Fragment>{a}</Fragment>
                </td>
                <td className="px-4 py-3">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Crop>
    ),
  },
];

function How() {
  return (
    <section id="how" className={cn(wrap, 'mt-24 scroll-mt-16 sm:mt-36')}>
      <p className="mb-3 text-[13px] font-medium text-muted">How it works</p>
      <h2 className={cn(H2, 'max-w-[720px]')}>From overheard context to a spoken sentence.</h2>
      <div className="mt-10 sm:mt-14">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className="grid items-center gap-6 border-t border-line py-10 sm:gap-20 sm:py-14 lg:grid-cols-2"
          >
            <div className={cn(i % 2 === 1 && 'lg:order-2')}>
              <p className="mono mb-3.5 text-[12px] text-faint">
                {i + 1} / {STEPS.length}
              </p>
              <h3 className={cn(H2, 'text-[26px] sm:text-[32px]')}>{s.title}</h3>
              <p className="mt-3 max-w-[420px] text-[16px] leading-relaxed text-muted sm:text-[17px]">
                {s.body}
              </p>
            </div>
            <div className="min-w-0">{s.crop}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Private() {
  const rows: Array<[string, string]> = [
    ['Priya is visiting on Sunday morning from Pune', 'Omi live · Tue 10:12'],
    ['Dr. Mehta said Papa must avoid sugar and sweets', 'Omi live · Mon 18:40'],
    ['Sunita bakes on Saturdays', 'Omi live · Sat 09:05'],
  ];
  return (
    <section className={cn(wrap, 'mt-24 sm:mt-36')}>
      <div className="grid items-center gap-10 border-y border-line py-14 sm:py-[72px] lg:grid-cols-[1fr_1.1fr] lg:gap-20">
        <div>
          <p className="mb-3 text-[13px] font-medium text-muted">Private by design</p>
          <h2 className={H2}>Every fact is visible, and deletable.</h2>
          <p className="mt-5 max-w-[440px] text-[17px] leading-normal text-muted">
            Each remembered fact shows where and when it was heard. Delete one, purge everything with a typed
            confirmation, or switch Memory off.
          </p>
        </div>
        <div className="overflow-hidden rounded-[10px] border border-line-strong bg-surface">
          <div className="flex h-10 items-center justify-between border-b border-line px-4 text-[12px]">
            <span className="text-ink">Memory</span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-[8px] border border-danger-line bg-danger-soft px-2.5 text-[12px] font-medium text-danger">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Purge all
            </span>
          </div>
          <ul>
            {rows.map(([t, s], i) => (
              <li
                key={t}
                className={cn(
                  'grid grid-cols-[1fr_auto] items-center gap-3 border-t border-line px-4 py-3 text-[13.5px] first:border-t-0',
                  i === 1 && 'bg-white/[0.03]',
                )}
              >
                <span>
                  {t}
                  <span className="mono mt-0.5 block text-[11px] text-faint">{s}</span>
                </span>
                <Trash2 className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Results() {
  return (
    <section id="results" className={cn(wrap, 'mt-24 scroll-mt-16 sm:mt-36')}>
      <p className="mb-3 text-[13px] font-medium text-muted">Results</p>
      <h2 className={cn(H2, 'max-w-[900px]')}>
        {facts.onHits} of {facts.ctxTotal} context-dependent fragments resolved within 3 yes/no questions with
        memory, vs {facts.offHits} of {facts.ctxTotal} without.
      </h2>
      <div className="mt-12 grid gap-10 sm:grid-cols-2 sm:gap-16">
        <BigRatio label="With memory" hits={facts.onHits} total={facts.ctxTotal} strong />
        <BigRatio label="Without memory" hits={facts.offHits} total={facts.ctxTotal} />
      </div>
      <p className="mt-12 max-w-[760px] text-[13px] leading-relaxed text-faint">
        Synthetic test set, n={facts.n} ({facts.ctxTotal} context-dependent, {facts.noCtxTotal} context-free),
        judged by the {facts.judge}. {facts.model}, run {facts.date}. {facts.firstQuestionNote}{' '}
        <a
          href={`${GITHUB_URL}/tree/main/eval-results`}
          className="text-ink underline underline-offset-[3px]"
        >
          Read the full evaluation
        </a>
        {!facts.live && ' (mock run: smoke test only)'}
      </p>
    </section>
  );
}

function Demo() {
  const embed = DEMO_VIDEO_URL ? embedUrl(DEMO_VIDEO_URL) : null;
  return (
    <section id="demo" className={cn(wrap, 'mt-24 scroll-mt-16 sm:mt-36')}>
      <p className="mb-3 text-[13px] font-medium text-muted">Demo</p>
      <h2 className={H2}>See it work end to end.</h2>
      <div className="mt-8 overflow-hidden rounded-[10px] border border-line-strong sm:mt-10">
        {embed ? (
          <iframe
            title="Unsaid demo video"
            src={embed}
            className="aspect-video w-full"
            loading="lazy"
            allow="encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <div className="relative flex aspect-video items-center justify-center bg-surface bg-[radial-gradient(closest-side,rgba(94,234,212,0.08),transparent_70%)]">
            <div className="absolute bottom-6 left-6 right-6 sm:bottom-11 sm:left-12">
              <Fragment className="block pb-2 text-[13px] sm:text-[15px]">{FRAG}</Fragment>
              <Resolved size="xl" glow className="max-w-[700px] !text-[22px] sm:!text-[44px]">
                {HYPS[0].sentence}
              </Resolved>
            </div>
            <span
              className="inline-flex h-14 w-14 items-center justify-center rounded-[10px] bg-ink text-canvas sm:h-[72px] sm:w-[72px]"
              role="img"
              aria-label="Demo video coming soon"
            >
              <Play className="h-6 w-6" aria-hidden="true" fill="currentColor" />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

const FAQ: Array<[string, string]> = [
  [
    'Is Unsaid a medical device?',
    'No. Unsaid is a communication aid. It does not diagnose, treat or monitor any condition, and it is not a substitute for speech and language therapy or clinical advice.',
  ],
  [
    'Who is it for?',
    'People with expressive (non-fluent) aphasia, for example after a stroke, who know what they mean but can only produce fragments, and the family members and carers who talk with them.',
  ],
  [
    'What does Omi record?',
    'Omi, the wearable or the phone app, captures nearby conversation and sends Unsaid real-time transcripts. Unsaid keeps the short facts it extracts, with source and time, and shows every one of them in the console.',
  ],
  [
    'Can the memory be deleted?',
    'Yes. Delete any single fact, purge everything for a person with a typed confirmation, or switch Memory off so Unsaid answers without it.',
  ],
  [
    'Is it open source?',
    'Yes. The code is MIT licensed on GitHub, including the eval that produced the numbers on this page.',
  ],
];

function Faq() {
  return (
    <section
      id="faq"
      className={cn(wrap, 'mt-24 grid scroll-mt-16 gap-10 sm:mt-36 lg:grid-cols-[360px_1fr] lg:gap-20')}
    >
      <div>
        <p className="mb-3 text-[13px] font-medium text-muted">FAQ</p>
        <h2 className={cn(H2, 'sm:text-[40px]')}>Questions, answered plainly.</h2>
      </div>
      <div className="border-b border-line">
        {FAQ.map(([q, a], i) => (
          <details key={q} className="group border-t border-line" open={i === 0}>
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 py-5 text-[17px] font-medium tracking-[-0.02em] sm:text-[18px] [&::-webkit-details-marker]:hidden">
              {q}
              <Plus
                className="h-5 w-5 shrink-0 text-faint transition-transform duration-200 group-open:rotate-45"
                aria-hidden="true"
              />
            </summary>
            <p className="max-w-[640px] pb-6 text-[16px] leading-relaxed text-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className={cn(wrap, 'mt-24 border-t border-line py-12 sm:mt-36')}>
      <div className="flex flex-wrap justify-between gap-8">
        <div className="max-w-[420px]">
          <Wordmark size={20} />
          <p className="mt-4 text-[13px] leading-relaxed text-faint">
            Unsaid is a communication aid, not a medical device. It only listens through a device its user has
            chosen to wear, and everyone nearby should know.
          </p>
        </div>
        <nav aria-label="Footer" className="flex gap-7 text-[14px] text-muted">
          <a className="hover:text-ink" href={GITHUB_URL}>
            GitHub
          </a>
          <a className="hover:text-ink" href={`${GITHUB_URL}/blob/main/docs/FRONTEND_CONTRACT.md`}>
            Event contract
          </a>
          <Link className="hover:text-ink" to="/app/live">
            Console
          </Link>
        </nav>
      </div>
      <p className="mt-10 flex flex-wrap items-center gap-3 text-[12px] text-faint">
        <Tag>MIT</Tag> Built for the Lyzr × Qdrant × Omi hackathon.
      </p>
    </footer>
  );
}

export function Landing() {
  return (
    <div className="grain bg-canvas">
      <a
        href="#how"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-canvas"
      >
        Skip to content
      </a>
      <Nav />
      <main>
        <Hero />
        <BuiltWith />
        <How />
        <Private />
        <Results />
        <Demo />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
