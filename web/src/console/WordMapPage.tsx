import { ArrowRight } from 'lucide-react';
import { useWordMap } from '../api/hooks';
import { errMessage } from '../api/client';
import { usePatient } from './patient';
import { Card, Fragment, Mono, Resolved, Tag } from '../design/primitives';
import { EmptyState, ErrorState, SkeletonList } from '../design/feedback';
import { fmtTime } from './format';

export function WordMapPage() {
  const { patient } = usePatient();
  const wm = useWordMap(patient?.id);
  const subs = wm.data?.substitutions ?? [];
  const utter = (wm.data?.resolvedUtterances ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-5 py-8">
      <header className="space-y-1">
        <Fragment>this… person’s… words…</Fragment>
        <h1 className="font-serif text-[40px] leading-tight">Word map</h1>
        <p className="max-w-xl text-[16px] text-muted">
          What Unsaid has learned about how {patient?.displayName ?? 'this patient'} speaks, built only from
          confirmed answers.
        </p>
      </header>
      {wm.isLoading && <SkeletonList label="Loading word map" />}
      {wm.isError && (
        <ErrorState
          title="Could not load the word map"
          detail={errMessage(wm.error)}
          onRetry={() => wm.refetch()}
        />
      )}
      {wm.isSuccess && subs.length === 0 && utter.length === 0 && (
        <EmptyState
          fragment="not… learned… yet…"
          title="Nothing learned yet"
          body="Each time a sentence is confirmed with Yes, Unsaid saves it and any word the patient uses in an unusual way."
        />
      )}
      {subs.length > 0 && (
        <section aria-labelledby="subs" className="space-y-3">
          <h2 id="subs" className="text-[15px] font-medium text-muted">
            Words and names
          </h2>
          <ul className="space-y-2">
            {subs.map((s) => (
              <li key={s.id}>
                <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                  <Fragment className="text-[16px]">{s.saidToken}</Fragment>
                  <ArrowRight className="h-4 w-4 text-muted" aria-label="means" />
                  <span className="font-serif text-[24px] leading-none">{s.meantToken}</span>
                  <Tag>{s.kind === 'NAME_ALIAS' ? 'Name' : s.kind === 'PHRASE' ? 'Phrase' : 'Word'}</Tag>
                  <span className="ml-auto flex items-center gap-4">
                    <Mono>
                      {s.hits} {s.hits === 1 ? 'time' : 'times'}
                    </Mono>
                    <Mono>last {fmtTime(s.lastSeenAt)}</Mono>
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {utter.length > 0 && (
        <section aria-labelledby="utt" className="space-y-3">
          <h2 id="utt" className="text-[15px] font-medium text-muted">
            Confirmed sentences
          </h2>
          <ul className="space-y-3">
            {utter.map((u) => (
              <li key={String(u.id)}>
                <Card className="space-y-2 p-4">
                  <Fragment className="block">{String(u.fragment)}</Fragment>
                  <Resolved size="md">{String(u.resolvedSentence)}</Resolved>
                  <Mono>
                    confirmed {String(u.hits ?? 1)}× · last {fmtTime(String(u.lastSeenAt ?? ''))}
                  </Mono>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
