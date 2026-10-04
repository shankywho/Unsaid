import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Brain, BookOpenText, GitBranch, FlaskConical, Settings as Cog } from 'lucide-react';
import { UNAUTHORIZED_EVENT } from '../api/client';
import { useMe, useOmiStatus, useSetContext } from '../api/hooks';
import { PatientProvider, usePatient, useStreamStatus } from './patient';
import { Chip, Select, StatusDot, Switch, Wordmark } from '../design/primitives';
import { ErrorState, Skeleton } from '../design/feedback';
import { cn } from '../design/cn';

const NAV = [
  { to: 'live', label: 'Live', icon: Activity },
  { to: 'memory', label: 'Memory', icon: Brain },
  { to: 'wordmap', label: 'Word map', icon: BookOpenText },
  { to: 'runs', label: 'Runs', icon: GitBranch },
  { to: 'eval', label: 'Eval', icon: FlaskConical },
  { to: 'settings', label: 'Settings', icon: Cog },
];

function ago(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/** One chip carries the whole connection story: Omi live / Simulated / Offline, plus the stream state. */
export function OmiBadge({ userId }: { userId?: string }) {
  const { data, isError } = useOmiStatus(userId);
  const { status } = useStreamStatus();
  let tone: 'live' | 'sim' | 'off' = 'off';
  let label = 'Omi offline';
  if (isError) {
    label = 'Omi status unavailable';
  } else if (data) {
    const c = data.segmentsLast5Min;
    if (c.OMI_REALTIME > 0) {
      tone = 'live';
      label = 'Omi live';
    } else if (c.SIMULATED > 0 || data.lastSegmentSource === 'SIMULATED') {
      tone = 'sim';
      label = 'Simulated';
    }
  }
  const dropped = status === 'reconnecting';
  if (dropped) {
    tone = 'off';
    label = 'Reconnecting';
  }
  return (
    <Chip tone={tone === 'live' ? 'live' : tone === 'off' ? 'danger' : 'neutral'} className="shrink-0">
      <StatusDot
        tone={tone === 'live' ? 'live' : tone === 'sim' ? 'sim' : 'danger'}
        pulse={tone === 'live'}
      />
      <span>{label}</span>
      {data?.lastSegmentAt && !dropped && (
        <span className="mono hidden sm:inline">{ago(data.lastSegmentAt)}</span>
      )}
    </Chip>
  );
}

function TopBar() {
  const { patients, patient, select } = usePatient();
  const setCtx = useSetContext(patient?.id);
  const on = patient?.contextEnabled ?? true;
  return (
    <header className="flex h-auto min-h-14 flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-2 sm:px-5">
      <Select
        label="Patient"
        value={patient?.id}
        onChange={select}
        options={patients.map((p) => ({ value: p.id, label: p.displayName }))}
        className="w-[min(100%,240px)]"
        lead={(sel) => (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border border-line-strong bg-raised text-[12px] font-semibold">
            {sel?.label?.[0] ?? '·'}
          </span>
        )}
      />
      <label className="inline-flex items-center gap-2.5 text-[14px] font-medium">
        <Switch
          label="Use personal memory"
          checked={on}
          onChange={(v) => setCtx.mutate(v)}
          disabled={!patient || setCtx.isPending}
        />
        <span>Memory</span>
        <span className="mono text-[11px] text-faint">{on ? 'ON' : 'OFF'}</span>
      </label>
      <div className="ml-auto">
        <OmiBadge userId={patient?.id} />
      </div>
    </header>
  );
}

function Sidebar() {
  const item =
    'flex h-[34px] shrink-0 items-center gap-2.5 rounded-[8px] px-2.5 text-[14px] font-medium md:justify-center xl:justify-start';
  return (
    <aside className="flex shrink-0 flex-col gap-2 border-b border-line md:w-14 md:gap-5 md:border-b-0 md:border-r md:px-2 md:py-4 xl:w-52 xl:px-3">
      <Link
        to="/"
        aria-label="Unsaid home"
        className="flex h-9 items-center px-4 md:justify-center md:px-0 xl:justify-start xl:px-2"
      >
        <span className="wm hidden text-[18px] text-ink md:inline xl:hidden" aria-hidden="true">
          U
        </span>
        <span className="md:hidden xl:inline">
          <Wordmark size={18} />
        </span>
      </Link>
      <nav
        aria-label="Console"
        className="flex gap-0.5 overflow-x-auto px-3 pb-2 md:flex-1 md:flex-col md:overflow-visible md:px-0 md:pb-0"
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              cn(
                item,
                isActive ? 'bg-white/[0.07] text-ink' : 'text-muted hover:bg-white/[0.04] hover:text-ink',
              )
            }
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="md:sr-only xl:not-sr-only">{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export function Shell() {
  const me = useMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    const h = () => {
      qc.removeQueries({ queryKey: ['me'] });
      nav('/login', { replace: true });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, h);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, h);
  }, [nav, qc]);

  if (me.isLoading)
    return (
      <div className="p-6" role="status" aria-label="Loading console">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  if (me.isError) {
    return (
      <div className="p-6">
        <ErrorState
          title="Cannot reach the API"
          detail={me.error.message}
          fix="Start the backend (pnpm dev) and reload."
          onRetry={() => me.refetch()}
        />
      </div>
    );
  }
  return (
    <PatientProvider>
      <div className="grain flex min-h-screen flex-col bg-canvas md:h-screen md:flex-row">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-canvas"
        >
          Skip to content
        </a>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col md:min-h-0">
          <TopBar />
          <main
            id="main"
            tabIndex={0}
            className="min-h-0 min-w-0 flex-1 focus-visible:outline-offset-[-2px] md:overflow-y-auto"
          >
            <Outlet />
          </main>
        </div>
      </div>
    </PatientProvider>
  );
}
