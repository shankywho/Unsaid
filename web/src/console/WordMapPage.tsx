import { useWordMap } from '../api/hooks';
import { errMessage } from '../api/client';
import { usePatient } from './patient';
import { Fragment, Mono, Tag } from '../design/primitives';
import { EmptyState, ErrorState, SkeletonList } from '../design/feedback';
import { PageHeader } from './PageHeader';
import { fmtTime } from './format';

export function WordMapPage() {
  const { patient } = usePatient();
  const wm = useWordMap(patient?.id);
  const subs = wm.data?.substitutions ?? [];
  const utter = (wm.data?.resolvedUtterances ?? []) as Array<Record<string, unknown>>;
  const maxHits = Math.max(1, ...subs.map((s) => s.hits), ...utter.map((u) => Number(u.hits ?? 1)));
  const rows = [
    ...subs.map((s) => ({
      id: s.id,
      heard: s.saidToken,
      means: s.meantToken,
      kind: s.kind === 'NAME_ALIAS' ? 'Alias' : s.kind === 'PHRASE' ? 'Phrase' : 'Substitution',
      hits: s.hits,
      last: s.lastSeenAt,
    })),
    ...utter.map((u) => ({
      id: String(u.id),
      heard: String(u.fragment),
      means: String(u.resolvedSentence),
      kind: 'Sentence',
      hits: Number(u.hits ?? 1),
      last: String(u.lastSeenAt ?? ''),
    })),
  ];
  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-12 sm:px-10">
      <PageHeader
        title="Word map"
        sub={`How ${patient?.displayName ?? 'this patient'}’s own words map to what they mean. Updated only when they confirm a sentence.`}
      />
      {wm.isLoading && <SkeletonList label="Loading word map" />}
      {wm.isError && <ErrorState title="Could not load the word map" detail={errMessage(wm.error)} onRetry={() => wm.refetch()} />}
      {wm.isSuccess && rows.length === 0 && (
        <EmptyState
          title="Nothing learned yet"
          body="Each time a sentence is confirmed with Yes, Unsaid saves it and any word the patient uses in an unusual way."
        />
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-[10px] border border-line-strong">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-line-strong text-left text-[12px] text-faint">
                <th scope="col" className="w-[28%] px-3 py-2.5 font-medium">Heard</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Means</th>
                <th scope="col" className="w-[130px] px-3 py-2.5 font-medium">Kind</th>
                <th scope="col" className="w-[150px] px-3 py-2.5 text-right font-medium">Confirmed</th>
                <th scope="col" className="w-[130px] px-3 py-2.5 font-medium">Last</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line first:border-t-0">
                  <td className="px-3 py-3">
                    <Fragment>{r.heard}</Fragment>
                  </td>
                  <td className="px-3 py-3 text-ink">{r.means}</td>
                  <td className="px-3 py-3">
                    <Tag>{r.kind}</Tag>
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex items-center justify-end gap-3">
                      <span className="h-[3px] w-14 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                        <span className="block h-full bg-muted" style={{ width: `${(r.hits / maxHits) * 100}%` }} />
                      </span>
                      <span className="mono w-6 text-right tabular-nums">{r.hits}</span>
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <Mono>{fmtTime(r.last)}</Mono>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
