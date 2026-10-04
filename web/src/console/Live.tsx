import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { keys, useAnswer, useSegments, useSimulateFragment } from '../api/hooks';
import { errMessage } from '../api/client';
import { useEventStream } from '../stream/useEventStream';
import { usePatient, useStreamStatus } from './patient';
import { initialLive, liveReducer, memoryHits, type FeedItem } from './liveState';
import { ConversationPanel, ReasoningTimeline, TranscriptFeed, traceTotalMs } from './components';
import { Button, fmtMs, inputClass } from '../design/primitives';
import { ErrorState, SkeletonList } from '../design/feedback';
import { cn } from '../design/cn';

export function Column({
  title,
  meta,
  children,
  footer,
  className = '',
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn('flex min-h-0 min-w-0 flex-col px-5', className)}>
      <div className="flex h-[52px] shrink-0 items-center justify-between">
        <h2 className="text-[13px] font-medium text-muted">{title}</h2>
        {meta}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-5">{children}</div>
      {footer}
    </section>
  );
}

export function Live() {
  const { patient } = usePatient();
  const { setStatus } = useStreamStatus();
  const qc = useQueryClient();
  const [state, dispatch] = useReducer(liveReducer, initialLive);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [announce, setAnnounce] = useState('');
  const seeded = useRef<string | undefined>(undefined);

  const segs = useSegments(patient?.id);
  const sim = useSimulateFragment();
  const answer = useAnswer();

  useEffect(() => {
    dispatch({ type: 'reset' });
    seeded.current = undefined;
  }, [patient?.id]);

  useEffect(() => {
    if (!patient || !segs.data || seeded.current === patient.id) return;
    seeded.current = patient.id;
    const items: FeedItem[] = segs.data.map((s) => ({
      kind: 'segment',
      id: s.dedupeKey,
      text: s.text,
      speaker: s.isUser ? 'Patient' : (s.speaker ?? 'Household'),
      isUser: s.isUser,
      source: s.source,
      ts: s.createdAt,
    }));
    dispatch({ type: 'seed_feed', items });
  }, [patient, segs.data]);

  const streamStatus = useEventStream(
    patient?.id,
    useCallback((e) => dispatch({ type: 'event', e }), []),
    useCallback(() => qc.invalidateQueries({ queryKey: keys.segments(patient?.id) }), [qc, patient?.id]),
  );
  useEffect(() => {
    setStatus(streamStatus);
    return () => setStatus('idle');
  }, [streamStatus, setStatus]);

  const conf = state.conf;

  useEffect(() => {
    if (!conf) return;
    if (conf.status === 'pending') setAnnounce(`Question ${conf.index + 1} of ${conf.count}: ${conf.question}`);
    else if (conf.status === 'resolved') setAnnounce(`Confirmed. ${conf.finalSentence}`);
    else if (conf.status === 'unresolved') setAnnounce('None of the three meanings fit. Nothing was spoken.');
    else if (conf.status === 'expired') setAnnounce('The question closed without an answer. Nothing was spoken.');
  }, [conf?.id, conf?.status, conf?.index, conf?.question, conf?.finalSentence]); // eslint-disable-line react-hooks/exhaustive-deps

  const respond = useCallback(
    (a: 'yes' | 'no') => {
      if (conf?.status !== 'pending' || answer.isPending) return;
      answer.mutate({ id: conf.id, answer: a });
    },
    [conf, answer],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
        return;
      if (e.key === 'y' || e.key === 'Y') respond('yes');
      if (e.key === 'n' || e.key === 'N') respond('no');
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [respond]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !patient) return;
    setText('');
    dispatch({ type: 'local_fragment', text: t, id: `local-${Date.now()}`, ts: new Date().toISOString() });
    sim.mutate({ userId: patient.id, text: t });
  }

  if (!patient)
    return (
      <div className="p-6">
        <SkeletonList label="Loading patients" />
      </div>
    );

  const total = traceTotalMs(state.steps);
  const hits = memoryHits(state.steps);
  const idle = state.steps.length === 0 && !state.thinking;
  const form = (
    <form onSubmit={submit} className="flex shrink-0 gap-2 pb-5 pt-3">
      <label htmlFor="sim" className="sr-only">
        Simulate a fragment of speech
      </label>
      <input
        id="sim"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="patient says…"
        autoComplete="off"
        className={cn(inputClass, 'mono flex-1 text-[13px]')}
      />
      <Button type="submit" disabled={!text.trim() || sim.isPending} aria-label="Send fragment" className="w-9 px-0">
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </form>
  );

  return (
    <div className="flex h-full flex-col" data-testid="live">
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="announcer">
        {announce}
      </div>
      <div
        className={cn(
          'grid min-h-0 flex-1 grid-cols-1 divide-y divide-line',
          'lg:grid-cols-[280px_minmax(0,1fr)_340px] lg:divide-x lg:divide-y-0 xl:grid-cols-[340px_minmax(0,1fr)_400px]',
        )}
      >
        <Column
          title="Conversation"
          meta={<span className="mono text-[12px] text-faint">{state.fragment ? patient.displayName.split(' ')[0] : '—'}</span>}
          className="order-first lg:order-last"
        >
          {sim.isError && (
            <ErrorState title="Could not send that fragment" detail={errMessage(sim.error)} fix="Check the connection and try again." />
          )}
          {answer.isError && <ErrorState title="Could not send that answer" detail={errMessage(answer.error)} />}
          <ConversationPanel
            conf={conf}
            fragment={state.fragment}
            thinking={state.thinking}
            busy={answer.isPending}
            onAnswer={respond}
            patientName={patient.displayName}
            learn={state.learn}
          />
        </Column>

        <Column
          title="Transcript"
          meta={<span className="mono text-[12px] text-faint">{state.feed.length} segments</span>}
          footer={form}
          className="lg:order-first"
        >
          {segs.isLoading ? (
            <SkeletonList label="Loading transcript" rows={3} />
          ) : (
            <TranscriptFeed feed={state.feed} patientName={patient.displayName} />
          )}
        </Column>

        <Column
          title="Reasoning"
          meta={
            <span className={cn('mono text-[12px]', state.thinking ? 'text-accent' : 'text-faint')}>
              {idle ? 'idle' : state.thinking && total === undefined ? 'running' : total !== undefined ? fmtMs(total) : ''}
            </span>
          }
        >
          <ReasoningTimeline
            steps={state.steps}
            thinking={state.thinking}
            classified={state.classified}
            hyps={state.hypotheses}
            hits={hits}
            conf={conf}
            learn={state.learn}
            highlightId={highlight}
            onHighlight={setHighlight}
          />
          {idle && <p className="mt-3 text-[13px] text-faint">Steps appear here as soon as a fragment is heard.</p>}
        </Column>
      </div>
    </div>
  );
}
