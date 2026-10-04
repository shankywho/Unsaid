import { useMutation, useQueryClient } from '@tanstack/react-query';
import { client, errMessage, unwrap } from '../api/client';
import { keys, useInsights, useMe, useOmiStatus } from '../api/hooks';
import { usePatient } from './patient';
import { Card, Fragment, Mono, Tag } from '../design/primitives';
import { ErrorState, Skeleton } from '../design/feedback';
import { fmtTime } from './format';

export function Settings() {
  const { patient } = usePatient();
  const me = useMe();
  const omi = useOmiStatus(patient?.id);
  const insights = useInsights(patient?.id);
  const qc = useQueryClient();
  const setMode = useMutation({
    mutationFn: (assistMode: 'AUTO' | 'ON' | 'OFF') =>
      unwrap(client.PATCH('/v1/users/{id}', { params: { path: { id: patient!.id } }, body: { assistMode } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
  const p = me.data?.principal;
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-5 py-8">
      <header className="space-y-1">
        <Fragment>how… it… behaves…</Fragment>
        <h1 className="font-serif text-[40px] leading-tight">Settings</h1>
      </header>

      <section aria-labelledby="assist" className="space-y-3">
        <h2 id="assist" className="font-serif text-[26px]">
          When to help
        </h2>
        <Card className="space-y-3 p-5">
          <label htmlFor="mode" className="block text-[15px] font-medium">
            Assist mode for {patient?.displayName}
          </label>
          <select
            id="mode"
            value={patient?.assistMode ?? 'AUTO'}
            onChange={(e) => setMode.mutate(e.target.value as 'AUTO' | 'ON' | 'OFF')}
            disabled={!patient || setMode.isPending}
            className="h-11 w-full max-w-sm rounded-[12px] border border-border-strong bg-canvas px-3 text-[16px]"
          >
            <option value="AUTO">Automatic: only help with fragments</option>
            <option value="ON">Always help: treat every phrase as a fragment</option>
            <option value="OFF">Off: never ask questions</option>
          </select>
          {setMode.isError && <ErrorState title="Could not save" detail={errMessage(setMode.error)} />}
          <p className="text-[14px] text-muted">
            The Memory switch in the top bar turns personal memory on or off for the next fragment.
          </p>
        </Card>
      </section>

      <section aria-labelledby="omi" className="space-y-3">
        <h2 id="omi" className="font-serif text-[26px]">
          Omi connection
        </h2>
        <Card className="space-y-2 p-5 text-[15px]">
          {omi.isLoading ? (
            <Skeleton className="h-16" />
          ) : omi.data ? (
            <>
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
                Webhook secret{' '}
                {omi.data.webhookSecretConfigured ? 'is set.' : 'is not set (development only).'}
              </p>
            </>
          ) : (
            <ErrorState
              title="Omi status unavailable"
              detail={omi.error ? errMessage(omi.error) : undefined}
            />
          )}
        </Card>
      </section>

      <section aria-labelledby="ins" className="space-y-3">
        <h2 id="ins" className="font-serif text-[26px]">
          Caregiver insights
        </h2>
        <Card className="p-5">
          {insights.isLoading ? (
            <Skeleton className="h-16" />
          ) : insights.data ? (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                ['Fragments heard', insights.data.stats.fragmentsCount],
                ['Questions asked', insights.data.stats.totalConfirmations],
                ['Confirmed', insights.data.stats.confirmedCount],
                ['Right on first question', insights.data.stats.firstTryCount],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-[14px] text-muted">{k}</dt>
                  <dd className="font-mono text-[22px] tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <ErrorState
              title="Could not load insights"
              detail={insights.error ? errMessage(insights.error) : undefined}
            />
          )}
        </Card>
      </section>

      <section aria-labelledby="acct" className="space-y-3">
        <h2 id="acct" className="font-serif text-[26px]">
          Account
        </h2>
        <Card className="p-5 text-[15px]">
          {p ? (
            <p>
              Signed in{' '}
              {p.type === 'session' ? (
                <>
                  as <Mono>{p.email}</Mono>
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
        </Card>
      </section>
    </div>
  );
}
