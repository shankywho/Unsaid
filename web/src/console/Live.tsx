import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { keys, useAnswer, useSegments, useSimulateFragment } from '../api/hooks';
import { errMessage } from '../api/client';
import { useEventStream } from '../stream/useEventStream';
import { usePatient } from './patient';
import { initialLive, liveReducer, memoryHits, type FeedItem } from './liveState';
import { ConversationPanel, HypothesisCards, ReasoningStepper, TranscriptFeed } from './components';
import { Button, Fragment, StatusDot } from '../design/primitives';
import { ErrorState, SkeletonList } from '../design/feedback';

function Column({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={`flex min-h-0 flex-col ${className}`}>
      <h2 className="border-b border-border px-5 py-3 text-[14px] font-medium text-muted">{title}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
    </section>
  );
}

export function Live() {
  const { patient } = usePatient();
  const qc = useQueryClient();
  const [state, dispatch] = useReducer(liveReducer, initialLive);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [announce, setAnnounce] = useState('');
  const seeded = useRef<string | undefined>(undefined);

  const segs = useSegments(patient?.id);
  const sim = useSimulateFragment();
  const answer = useAnswer();

  // reset when switching patient
  useEffect(() => {
    dispatch({ type: 'reset' });
    seeded.current = undefined;
  }, [patient?.id]);

  // seed the transcript once from history
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

  const conf = state.conf;

  // screen-reader announcements: questions and resolved sentences
  useEffect(() => {
    if (!conf) return;
    if (conf.status === 'pending')
      setAnnounce(`Question ${conf.index + 1} of ${conf.count}: ${conf.question}`);
    else if (conf.status === 'resolved') setAnnounce(`Confirmed. ${conf.finalSentence}`);
    else if (conf.status === 'unresolved') setAnnounce('None of the three meanings fit. Nothing was spoken.');
    else if (conf.status === 'expired')
      setAnnounce('The question closed without an answer. Nothing was spoken.');
  }, [conf?.id, conf?.status, conf?.index, conf?.question, conf?.finalSentence]); // eslint-disable-line react-hooks/exhaustive-deps

  const respond = useCallback(
    (a: 'yes' | 'no') => {
      if (conf?.status !== 'pending' || answer.isPending) return;
      answer.mutate({ id: conf.id, answer: a });
    },
    [conf, answer],
  );

  // Y / N keyboard shortcuts (ignored while typing)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'SELECT' ||
        el.isContentEditable
      )
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

  const hits = memoryHits(state.steps);
  return (
    <div className="flex h-auto flex-col lg:h-[calc(100vh-61px)]">
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="announcer">
        {announce}
      </div>
      <div className="flex items-center gap-2 border-b border-border px-5 py-2 text-[14px] text-muted">
        <StatusDot tone={streamStatus === 'open' ? 'live' : 'idle'} pulse={streamStatus === 'open'} />
        {streamStatus === 'open'
          ? 'Connected: events arrive as they happen'
          : streamStatus === 'idle'
            ? 'Not connected'
            : 'Reconnecting to the live feed…'}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,420px)] lg:divide-x lg:divide-y-0">
        {/* Conversation first on small screens */}
        <Column title="Conversation" className="order-first lg:order-last">
          {sim.isError && (
            <ErrorState
              title="Could not send that fragment"
              detail={errMessage(sim.error)}
              fix="Check the connection and try again."
              className="mb-4"
            />
          )}
          {answer.isError && (
            <ErrorState
              title="Could not send that answer"
              detail={errMessage(answer.error)}
              className="mb-4"
            />
          )}
          <ConversationPanel
            conf={conf}
            fragment={state.fragment}
            thinking={state.thinking}
            busy={answer.isPending}
            onAnswer={respond}
          />
        </Column>

        <Column title="Transcript" className="lg:order-first">
          {segs.isLoading ? (
            <SkeletonList label="Loading transcript" rows={3} />
          ) : (
            <TranscriptFeed feed={state.feed} />
          )}
        </Column>

        <Column title="Reasoning">
          <ReasoningStepper
            steps={state.steps}
            thinking={state.thinking}
            classified={state.classified}
            hypCount={state.hypotheses.length}
            highlightId={highlight}
            onHighlight={setHighlight}
          />
          <HypothesisCards
            hyps={state.hypotheses}
            hits={hits}
            currentIndex={
              conf?.status === 'pending' ? conf.index : conf?.status === 'resolved' ? conf.index : undefined
            }
            highlightId={highlight}
            onHighlight={setHighlight}
          />
        </Column>
      </div>

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-border bg-canvas p-3 sm:px-5"
      >
        <label htmlFor="sim" className="sr-only">
          Simulate a fragment of speech
        </label>
        <Fragment className="hidden shrink-0 sm:inline">patient says…</Fragment>
        <input
          id="sim"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="water… Ramesh… bill"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-[12px] border border-border-strong bg-canvas px-4 font-mono text-[15px] text-ink placeholder:text-muted"
        />
        <Button type="submit" disabled={!text.trim() || sim.isPending}>
          <Send className="h-4 w-4" aria-hidden="true" /> Send fragment
        </Button>
      </form>
    </div>
  );
}
