import { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { useDeleteFact, useMemoryFacts, usePurge, useSegmentsByKey } from '../api/hooks';
import { errMessage, type ApiError } from '../api/client';
import { usePatient } from './patient';
import { Button, Mono, inputClass } from '../design/primitives';
import { EmptyState, ErrorState, SkeletonList } from '../design/feedback';
import { ConfirmDialog } from '../design/dialog';
import { PageHeader } from './PageHeader';
import { fmtTime } from './format';

interface Fact {
  id: string;
  type?: string;
  text?: string;
  entities?: string[];
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
  health_instruction: 'Health instructions',
};
const SOURCE_LABEL: Record<string, string> = {
  OMI_REALTIME: 'Omi live',
  OMI_MEMORY: 'Omi memory',
  SIMULATED: 'Simulated',
};
export const PURGE_WORD = 'PURGE';

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
    <div className="mx-auto max-w-[1100px] px-5 pb-12 sm:px-10">
      <PageHeader
        title="Memory"
        sub={`What Unsaid remembers about ${patient?.displayName ?? 'this patient'}’s household, grouped by kind, with where and when each fact was heard.`}
        right={
          <>
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(q.trim());
              }}
              className="relative"
            >
              <label htmlFor="mq" className="sr-only">
                Search memory
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-[10px] h-4 w-4 text-faint"
                aria-hidden="true"
              />
              <input
                id="mq"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  if (!e.target.value) setSubmitted('');
                }}
                placeholder="Search facts"
                className={`${inputClass} w-[260px] pl-9`}
              />
            </form>
            <Button
              variant="danger"
              onClick={() => {
                setTyped('');
                setPurging(true);
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Purge all
            </Button>
          </>
        }
      />

      {facts.isLoading && <SkeletonList label="Loading memory" />}
      {facts.isError && (
        <ErrorState
          title="Couldn’t load memory"
          detail={`Nothing has been changed. ${errMessage(facts.error)}`}
          requestId={(facts.error as ApiError).requestId}
          onRetry={() => facts.refetch()}
        />
      )}
      {facts.isSuccess && list.length === 0 && (
        <EmptyState
          title={submitted ? 'No memories match' : 'Nothing remembered yet'}
          body={
            submitted
              ? 'Try different words, or clear the search.'
              : 'Facts appear as Unsaid hears the household talk. Run pnpm seed for the demo household.'
          }
        />
      )}

      {groups.map(([type, items]) => (
        <section key={type} aria-labelledby={`g-${type}`} className="mb-7">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id={`g-${type}`} className="text-[15px] font-semibold tracking-[-0.02em]">
              {TYPE_LABEL[type] ?? type}
            </h2>
            <Mono>{items.length}</Mono>
          </div>
          <ul className="overflow-hidden rounded-[10px] border border-line-strong">
            {items.map((f) => {
              const src = (f.sourceSegmentIds ?? []).map((k) => byKey.get(k)).find(Boolean);
              return (
                <li
                  key={f.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-[14px] first:border-t-0 hover:bg-white/[0.03] sm:grid-cols-[1fr_120px_110px_36px]"
                >
                  <div>
                    <p className="text-ink">{f.text}</p>
                    {src && (
                      <p className="mt-0.5 text-[12.5px] text-faint">
                        Heard{src.speaker ? ` from ${src.speaker}` : ''}: “{src.text}”
                      </p>
                    )}
                  </div>
                  <Mono className="hidden sm:block">
                    {src ? (SOURCE_LABEL[src.source] ?? src.source) : '—'}
                  </Mono>
                  <Mono className="hidden sm:block">{fmtTime(src?.createdAt ?? f.createdAt)}</Mono>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-8 px-0"
                    aria-label={`Delete memory: ${f.text}`}
                    onClick={() => setToDelete(f)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

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
        title={`Purge all memory for ${patient?.displayName ?? 'this patient'}?`}
        description="This permanently deletes every remembered fact and learned word. This can’t be undone."
        confirmLabel="Purge memory"
        busy={purge.isPending}
        confirmDisabled={typed.trim() !== PURGE_WORD}
        onConfirm={() => purge.mutate(undefined, { onSuccess: () => setPurging(false) })}
      >
        <label htmlFor="purge" className="mb-2 block text-[13px] text-muted">
          Type <span className="mono text-ink">{PURGE_WORD}</span> to confirm
        </label>
        <input
          id="purge"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className={`${inputClass} mono text-[13px]`}
        />
        {purge.isError && (
          <ErrorState className="mt-3" title="Could not purge" detail={errMessage(purge.error)} />
        )}
      </ConfirmDialog>
    </div>
  );
}
