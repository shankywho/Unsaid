import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import evalReport from '../generated/eval.json';
import { Button, Eyebrow, Fragment, Resolved } from '../design/primitives';
import { Reveal } from '../design/motion';
import { cn } from '../design/cn';
import { ProductDemo, Frame } from './ProductWindow';
import { ConfirmMock, LearnMock, ListenMock, PrivateMock, RememberMock, UnderstandMock } from './mocks';
import { EvalBars, evalFacts, type Report } from './evalData';
import { DEMO_VIDEO_URL, GITHUB_URL, embedUrl } from './site';

const report = evalReport as unknown as Report;
const wrap = 'mx-auto w-full max-w-[1120px] px-4 sm:px-6';

function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-canvas/95">
      <div className={cn(wrap, 'flex h-16 items-center gap-6')}>
        <a href="/" className="font-serif text-[28px] leading-none text-ink">
          Unsaid
        </a>
        <nav aria-label="Primary" className="ml-4 hidden items-center gap-6 text-[15px] text-muted sm:flex">
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
        <Link to="/login" className="ml-auto">
          <Button size="sm">Open console</Button>
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className={cn(wrap, 'pb-16 pt-14 sm:pb-24 sm:pt-20')}>
      <Reveal className="max-w-[860px]">
        <Fragment className="mb-5 block text-[15px]">Sunday… Priya… cake… no</Fragment>
        <Resolved as="h1" size="xl" className="!text-[48px] !leading-[1.02] sm:!text-[84px]">
          Finishing the sentences aphasia takes away.
        </Resolved>
        <p className="mt-6 max-w-[600px] text-[19px] leading-relaxed text-muted">
          Unsaid listens to everyday conversation, remembers what matters, and turns a few broken words into a
          sentence the patient confirms with one yes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#demo">
            <Button size="lg">Watch the demo</Button>
          </a>
          <a href={GITHUB_URL}>
            <Button size="lg" variant="secondary">
              View on GitHub <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </a>
        </div>
      </Reveal>
      <Reveal delay={0.15} className="mt-14">
        <ProductDemo />
      </Reveal>
    </section>
  );
}

function BuiltWith() {
  return (
    <section aria-label="Built with" className="border-y border-border bg-surface">
      <div className={cn(wrap, 'flex flex-wrap items-center gap-x-12 gap-y-4 py-8')}>
        <Fragment className="text-[13px]">built… with…</Fragment>
        {[
          ['Omi', 'listens'],
          ['Qdrant', 'remembers'],
          ['Lyzr', 'reasons'],
        ].map(([n, v]) => (
          <p key={n} className="flex items-baseline gap-2">
            <span className="text-[26px] font-semibold tracking-tight text-ink">{n}</span>
            <span className="text-[14px] text-muted">{v}</span>
          </p>
        ))}
      </div>
    </section>
  );
}

function Feature({
  id,
  eyebrow,
  title,
  children,
  mock,
  flip,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
  mock: ReactNode;
  flip?: boolean;
}) {
  return (
    <section id={id} className={cn(wrap, 'scroll-mt-20 py-14 sm:py-20')}>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal inView className={cn(flip && 'lg:order-last')}>
          <Eyebrow className="mb-3">{eyebrow}</Eyebrow>
          <Resolved as="h2" size="lg" className="!text-[36px] sm:!text-[44px]">
            {title}
          </Resolved>
          <p className="mt-4 max-w-[480px] text-[17px] leading-relaxed text-muted">{children}</p>
        </Reveal>
        <Reveal inView delay={0.08} className="min-w-0">
          {mock}
        </Reveal>
      </div>
    </section>
  );
}

function Results() {
  const f = evalFacts(report);
  const on = report.results.find((r) => r.mode === 'context ON')!;
  const off = report.results.find((r) => r.mode === 'context OFF')!;
  const firstGuessNote = on.top1Hits <= off.top1Hits;
  return (
    <section id="results" className="border-y border-border bg-surface">
      <div className={cn(wrap, 'py-16 sm:py-24')}>
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <Reveal inView>
            <Eyebrow className="mb-3">measured… not… claimed…</Eyebrow>
            <Resolved as="h2" size="lg" className="!text-[36px] sm:!text-[44px]">
              With memory, {f.onHits} of {f.ctxTotal} fragments were resolved within three questions. Without
              it, {f.offHits}.
            </Resolved>
          </Reveal>
          <Reveal inView delay={0.08} className="self-center">
            <p className="mb-5 text-[16px] text-muted">
              Fragments that depend on personal context, resolved within three yes/no questions.
            </p>
            <EvalBars facts={f} />
          </Reveal>
        </div>
        <p className="mt-10 max-w-3xl border-t border-border pt-5 text-[14px] leading-relaxed text-muted">
          Synthetic test set: {f.n} fragments, {f.ctxTotal} of them context-dependent, written by the project
          and judged by an AI agent, not by clinicians or patients. Run {f.date}
          {f.live ? '' : ' (mock mode)'} on {f.model}.
          {firstGuessNote && ' Memory did not improve how often the first question was right in this run.'}{' '}
          <Link to="/login" className="underline underline-offset-4">
            See the full evaluation
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

function Demo() {
  const embed = DEMO_VIDEO_URL ? embedUrl(DEMO_VIDEO_URL) : null;
  return (
    <section id="demo" className={cn(wrap, 'scroll-mt-20 py-16 sm:py-24')}>
      <Reveal inView className="mb-8 max-w-xl">
        <Eyebrow className="mb-3">watch… listen…</Eyebrow>
        <Resolved as="h2" size="lg" className="!text-[36px] sm:!text-[44px]">
          See it work, from fragment to spoken sentence.
        </Resolved>
      </Reveal>
      <Frame title="Demo video">
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
          <div className="grid aspect-video place-items-center bg-surface p-6 text-center">
            <div className="space-y-4">
              <Fragment className="block text-[15px]">Sunday… Priya… cake… no</Fragment>
              <Resolved size="lg">Please tell Priya not to bring cake on Sunday.</Resolved>
              <p className="text-[15px] text-muted">The demo video will be embedded here.</p>
            </div>
          </div>
        )}
      </Frame>
    </section>
  );
}

const FAQ: Array<[string, ReactNode]> = [
  [
    'Is this a medical device?',
    'No. Unsaid is a communication aid. It does not diagnose, treat or give medical advice, and it never speaks a sentence the patient has not confirmed.',
  ],
  [
    'Who is it for?',
    'People who understand speech but struggle to put words into sentences, for example after a stroke, and the family and caregivers who talk with them every day.',
  ],
  [
    'What does Omi record?',
    'Omi’s microphone, on a phone or a wearable, sends a live transcript to Unsaid. Unsaid stores those lines and pulls out facts. Lines from other people are deleted after 14 days by default. Use it only with the consent of the patient and everyone whose speech is captured.',
  ],
  [
    'Can memory be deleted?',
    'Yes. Open the Memory screen to see every stored fact and where it was heard, delete a single fact, or erase everything for a patient.',
  ],
  [
    'Is it open source?',
    <>
      Yes, under the MIT license. The code, API contract and evaluation reports are on{' '}
      <a href={GITHUB_URL} className="underline underline-offset-4">
        GitHub
      </a>
      .
    </>,
  ],
];

function Faq() {
  return (
    <section id="faq" className={cn(wrap, 'py-16 sm:py-24')}>
      <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <Eyebrow className="mb-3">questions… answers…</Eyebrow>
          <Resolved as="h2" size="lg" className="!text-[36px] sm:!text-[44px]">
            Straight answers.
          </Resolved>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 text-[18px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                {q}
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-90"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const col = 'space-y-2 text-[15px]';
  const a = 'text-muted hover:text-ink';
  return (
    <footer className="border-t border-border bg-surface">
      <div className={cn(wrap, 'grid gap-10 py-12 sm:grid-cols-[1.4fr_1fr_1fr]')}>
        <div className="space-y-3">
          <p className="font-serif text-[28px] leading-none">Unsaid</p>
          <p className="max-w-sm text-[14px] leading-relaxed text-muted">
            A communication aid, not a medical device. Use only with the informed consent of the patient and
            everyone whose speech is captured.
          </p>
        </div>
        <nav aria-label="Product" className={col}>
          <p className="text-[13px] font-medium text-ink">Product</p>
          <p>
            <a className={a} href="#how">
              How it works
            </a>
          </p>
          <p>
            <a className={a} href="#demo">
              Demo
            </a>
          </p>
          <p>
            <Link className={a} to="/login">
              Open console
            </Link>
          </p>
        </nav>
        <nav aria-label="Docs" className={col}>
          <p className="text-[13px] font-medium text-ink">Docs</p>
          <p>
            <a className={a} href={`${GITHUB_URL}#readme`}>
              README
            </a>
          </p>
          <p>
            <a className={a} href={`${GITHUB_URL}/blob/main/docs/openapi.yaml`}>
              API reference
            </a>
          </p>
          <p>
            <a className={a} href={`${GITHUB_URL}/blob/main/docs/FRONTEND_CONTRACT.md`}>
              Event contract
            </a>
          </p>
          <p>
            <a className={a} href={GITHUB_URL}>
              GitHub
            </a>
          </p>
        </nav>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <div className="bg-canvas">
      <a
        href="#how"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Nav />
      <main>
        <Hero />
        <BuiltWith />
        <Feature
          id="how"
          eyebrow="listen… kitchen… Friday…"
          title="Everyday conversation becomes context."
          mock={<ListenMock />}
        >
          Omi hears the household through a phone or a wearable. Unsaid separates the patient’s own words from
          everyone else’s, and keeps the rest as raw material for memory.
        </Feature>
        <Feature
          eyebrow="remember… who… when…"
          title="Every memory shows where it came from."
          mock={<RememberMock />}
          flip
        >
          Facts are stored per person with the line they were heard in and the time. Raw speech ages out after
          14 days by default; the facts stay until you delete them.
        </Feature>
        <Feature
          eyebrow="understand… three… meanings…"
          title="A fragment becomes three possible meanings."
          mock={<UnderstandMock />}
        >
          Agents read the fragment, search memory, and propose three different ways to finish it: asking,
          stating or requesting. Each one shows the memories it relied on.
        </Feature>
        <Feature
          eyebrow="confirm… yes… no…"
          title="Nothing is said until the patient says yes."
          mock={<ConfirmMock />}
          flip
        >
          One question at a time, with large Yes and No buttons and a voice. No moves to the next meaning.
          After three, Unsaid stops and asks for another try.
        </Feature>
        <Feature eyebrow="learn… car… walk…" title="It learns how this person speaks." mock={<LearnMock />}>
          Confirmed sentences and recurring word swaps go into a personal word map, so the next fragment
          starts from what already worked.
        </Feature>
        <Feature eyebrow="private… see… delete…" title="Private by design." mock={<PrivateMock />} flip>
          See every stored fact, delete one, or erase it all. Capture runs only with the consent of the
          patient and everyone being recorded.
        </Feature>
        <Results />
        <Demo />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
