import { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { useDeleteFact, useMemoryFacts, usePurge, useSegmentsByKey } from '../api/hooks';
import { errMessage } from '../api/client';
import { usePatient } from './patient';
import { Button, Card, Fragment, Mono, Tag } from '../design/primitives';
import { EmptyState, ErrorState, SkeletonList } from '../design/feedback';
import { ConfirmDialog } from '../design/dialog';
import { fmtTime } from './format';
import { Reveal } from '../design/motion';

interface Fact {
  id: string;
  type?: string;
  text?: string;
  entities?: string[];
  confidence?: number;
  mentions?: number;
  createdAt?: string;
  eventTime?: string;
  sourceSegmentIds?: string[];
}
const TYPE_LABEL: Record<string, string> = {
  person: 'People',
  relationship: 'Relationships',
  event: 'Events',
  routine: 'Routines',
  preference: 'Preferences',
  place: 'Places',
  object: 'Objects',
  health_instruction: 'Health instructions from the care team',
};

const normalize = (raw: Record<string, unknown>): Fact => {
  const p = (raw.payload && typeof raw.payload === 'object' ? raw.payload : raw) as Record<string, unknown>;
  return {
    ...(p as unknown as Fact),
    id: String(raw.id),
    text: (raw.text as string) ?? (p.text as string),
    type: (raw.type as string) ?? (p.type as string),
  };
};

export function Memory() {
  const { patient } = usePatient();
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const facts = useMemoryFacts(patient?.id, submitted);
  const del = useDeleteFact(patient?.id);
  const purge = usePurge(patient?.id);
  const [toDelete, setToDelete] = useState<Fact | null>(null);
  const [purging, setPurging] = useState(false);
  const [typed, setTyped] = useState('');

  const list = useMemo(
    () => (facts.data ?? []).map((f) => normalize(f as Record<string, unknown>)),
    [facts.data],
  );
  const sourceIds = useMemo(
    () => [...new Set(list.flatMap((f) => f.sourceSegmentIds ?? []))].slice(0, 50),
    [list],
  );
  const sources = useSegmentsByKey(patient?.id, sourceIds);
  const byKey = useMemo(() => new Map((sources.data ?? []).map((s) => [s.dedupeKey, s])), [sources.data]);

  const groups = useMemo(() => {
    const m = new Map<string, Fact[]>();
    for (const f of list) m.set(f.type ?? 'other', [...(m.get(f.type ?? 'other') ?? []), f]);
    return [...m.entries()];
  }, [list]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-5 py-8">
      <header className="space-y-1">
        <Fragment>remember… every… detail…</Fragment>
        <h1 className="font-serif text-[40px] leading-tight">Memory</h1>
        <p className="max-w-xl text-[16px] text-muted">
          Facts Unsaid learned from everyday conversation, each with where and when it was heard. Delete any
          one, or erase everything.
        </p>
      </header>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q.trim());
        }}
        className="flex gap-2"
      >
        <label htmlFor="mq" className="sr-only">
          Search memory
        </label>
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-muted"
            aria-hidden="true"
          />
          <input
            id="mq"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by meaning, for example “water bill”"
            className="h-11 w-full rounded-[12px] border border-border-strong bg-canvas pl-10 pr-4 text-[16px] placeholder:text-muted"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {submitted && (
          <Button
            variant="ghost"
            onClick={() => {
              setQ('');
              setSubmitted('');
            }}
          >
            Clear
          </Button>
        )}
      </form>

      {facts.isLoading && <SkeletonList label="Loading memory" />}
      {facts.isError && (
        <ErrorState
          title="Could not load memory"
          detail={errMessage(facts.error)}
          onRetry={() => facts.refetch()}
        />
      )}
      {facts.isSuccess && list.length === 0 && (
        <EmptyState
          fragment="nothing… remembered… yet…"
          title={submitted ? 'No memories match' : 'Nothing remembered yet'}
          body={
            submitted
              ? 'Try different words, or clear the search.'
              : 'Facts appear after Omi hears everyday conversation, or after you run pnpm seed for the demo household.'
          }
        />
      )}

      {groups.map(([type, items]) => (
        <section key={type} aria-labelledby={`g-${type}`} className="space-y-3">
          <h2 id={`g-${type}`} className="text-[15px] font-medium text-muted">
            {TYPE_LABEL[type] ?? type} <span className="font-mono text-[13px]">{items.length}</span>
          </h2>
          <ul className="space-y-3">
            {items.map((f) => {
              const srcs = (f.sourceSegmentIds ?? []).map((k) => byKey.get(k)).filter(Boolean);
              return (
                <li key={f.id}>
                  <Reveal>
                    <Card className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <p className="text-[17px] leading-snug text-ink">{f.text}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete memory: ${f.text}`}
                          onClick={() => setToDelete(f)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                      {(f.entities?.length ?? 0) > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="About">
                          {f.entities!.map((e) => (
                            <li key={e}>
                              <Tag>{e}</Tag>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-3 space-y-1 border-t border-border pt-3 text-[14px] text-muted">
                        {srcs.length > 0 ? (
                          srcs.slice(0, 2).map((s) => (
                            <p key={s!.dedupeKey}>
                              Heard{s!.speaker ? ` from ${s!.speaker}` : ''}:{' '}
                              <span className="text-ink">“{s!.text}”</span>{' '}
                              <Mono>{fmtTime(s!.createdAt)}</Mono>
                            </p>
                          ))
                        ) : (
                          <p>
                            Source transcript no longer stored (raw speech is deleted after the retention
                            window). Learned <Mono>{fmtTime(f.createdAt)}</Mono>
                          </p>
                        )}
                        {f.eventTime && (
                          <p>
                            Refers to <Mono>{fmtTime(f.eventTime)}</Mono>
                          </p>
                        )}
                      </div>
                    </Card>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section className="rounded-[14px] border border-[#ecc9c5] bg-danger-soft p-5">
        <h2 className="font-serif text-[24px]">Erase all memory</h2>
        <p className="mt-1 max-w-lg text-[15px] text-ink">
          Removes every remembered fact and learned word for {patient?.displayName}. This cannot be undone.
        </p>
        <Button
          variant="danger"
          className="mt-3"
          onClick={() => {
            setTyped('');
            setPurging(true);
          }}
        >
          Erase all memory…
        </Button>
      </section>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this memory?"
        description={toDelete?.text ?? ''}
        confirmLabel="Delete memory"
        busy={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
      >
        {del.isError && <ErrorState title="Could not delete" detail={errMessage(del.error)} />}
      </ConfirmDialog>

      <ConfirmDialog
        open={purging}
        onOpenChange={setPurging}
        title="Erase all memory?"
        description="Type “erase” to confirm. Every fact and learned word for this patient will be deleted."
        confirmLabel="Erase everything"
        busy={purge.isPending}
        confirmDisabled={typed.trim().toLowerCase() !== 'erase'}
        onConfirm={() => purge.mutate(undefined, { onSuccess: () => setPurging(false) })}
      >
        <label htmlFor="erase" className="mb-1.5 block text-[14px] font-medium">
          Type erase
        </label>
        <input
          id="erase"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="h-11 w-full rounded-[12px] border border-border-strong px-3 text-[16px]"
        />
        {purge.isError && (
          <ErrorState className="mt-3" title="Could not erase" detail={errMessage(purge.error)} />
        )}
      </ConfirmDialog>
    </div>
  );
}
