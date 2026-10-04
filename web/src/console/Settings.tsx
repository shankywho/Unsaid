import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client, errMessage, unwrap } from '../api/client';
import { keys, useInsights, useMe, useOmiStatus } from '../api/hooks';
import { usePatient } from './patient';
import { Mono, Select, Tag } from '../design/primitives';
import { ErrorState, Skeleton } from '../design/feedback';
import { PageHeader } from './PageHeader';
import { fmtTime } from './format';

type Mode = 'AUTO' | 'ON' | 'OFF';

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 border-t border-line py-7 md:grid-cols-[240px_1fr] md:gap-10"
    >
      <h2 id={id} className="text-[15px] font-semibold tracking-[-0.02em]">
        {title}
      </h2>
      <div className="min-w-0 text-[14px]">{children}</div>
    </section>
  );
}

export function Settings() {
  const { patient } = usePatient();
  const me = useMe();
  const omi = useOmiStatus(patient?.id);
  const insights = useInsights(patient?.id);
  const qc = useQueryClient();
  const setMode = useMutation({
    mutationFn: (assistMode: Mode) =>
      unwrap(client.PATCH('/v1/users/{id}', { params: { path: { id: patient!.id } }, body: { assistMode } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
  const p = me.data?.principal;
  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-12 sm:px-10">
      <PageHeader title="Settings" />

      <Section id="assist" title="When to help">
        <p className="mb-2.5 text-muted">Assist mode for {patient?.displayName}</p>
        <Select<Mode>
          label="Assist mode"
          value={(patient?.assistMode as Mode) ?? 'AUTO'}
          onChange={(v) => setMode.mutate(v)}
          className="max-w-sm"
          menuClassName="w-[min(24rem,90vw)]"
          options={[
            { value: 'AUTO', label: 'Automatic', hint: 'Only help with fragments' },
            { value: 'ON', label: 'Always help', hint: 'Treat every phrase as a fragment' },
            { value: 'OFF', label: 'Off', hint: 'Never ask questions' },
          ]}
        />
        {setMode.isError && <ErrorState title="Could not save" detail={errMessage(setMode.error)} />}
        <p className="mt-3 text-faint">
          The Memory switch in the top bar turns personal memory on or off for the next fragment.
        </p>
      </Section>

      <Section id="omi" title="Omi connection">
        {omi.isLoading ? (
          <Skeleton className="h-16" />
        ) : omi.data ? (
          <div className="space-y-1.5">
            <p>
              Last segment:{' '}
              <Mono>{omi.data.lastSegmentAt ? fmtTime(omi.data.lastSegmentAt) : 'none yet'}</Mono>{' '}
              {omi.data.lastSegmentSource && (
                <Tag>
                  {omi.data.lastSegmentSource === 'OMI_REALTIME'
                    ? 'From Omi'
                    : omi.data.lastSegmentSource === 'SIMULATED'
                      ? 'Simulated'
                      : 'Omi conversation'}
                </Tag>
              )}
            </p>
            <p className="text-muted">
              Last 5 minutes: {omi.data.segmentsLast5Min.OMI_REALTIME} from Omi,{' '}
              {omi.data.segmentsLast5Min.SIMULATED} simulated.
            </p>
            <p className="text-muted">
              Webhook secret {omi.data.webhookSecretConfigured ? 'is set.' : 'is not set (development only).'}
            </p>
          </div>
        ) : (
          <ErrorState title="Omi status unavailable" detail={omi.error ? errMessage(omi.error) : undefined} />
        )}
      </Section>

      <Section id="ins" title="Caregiver insights">
        {insights.isLoading ? (
          <Skeleton className="h-16" />
        ) : insights.data ? (
          <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            {[
              ['Fragments heard', insights.data.stats.fragmentsCount],
              ['Questions asked', insights.data.stats.totalConfirmations],
              ['Confirmed', insights.data.stats.confirmedCount],
              ['Right on first question', insights.data.stats.firstTryCount],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-[13px] text-muted">{k}</dt>
                <dd className="mono text-[24px] tabular-nums tracking-[-0.03em]">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <ErrorState
            title="Could not load insights"
            detail={insights.error ? errMessage(insights.error) : undefined}
          />
        )}
      </Section>

      <Section id="acct" title="Account">
        {p ? (
          <p>
            Signed in{' '}
            {p.type === 'session' ? (
              <>
                as <Mono className="text-ink">{p.email}</Mono>
              </>
            ) : (
              'with the API key'
            )}
            .
            {p.type === 'session' && (
              <span className="text-muted"> Session ends {fmtTime(p.expiresAt)}.</span>
            )}
          </p>
        ) : (
          <Skeleton className="h-6" />
        )}
      </Section>
    </div>
  );
}
