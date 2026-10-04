import { useEffect } from 'react';
import { NavLink, Navigate, Outlet, useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Brain,
  BookOpenText,
  GitBranch,
  FlaskConical,
  Settings as Cog,
  LogOut,
} from 'lucide-react';
import { UNAUTHORIZED_EVENT, client, unwrap } from '../api/client';
import { useMe, useOmiStatus, useSetContext } from '../api/hooks';
import { PatientProvider, usePatient } from './patient';
import { Button, StatusDot, Toggle } from '../design/primitives';
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
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function OmiBadge({ userId }: { userId?: string }) {
  const { data, isError } = useOmiStatus(userId);
  let tone: 'live' | 'sim' | 'idle' | 'danger' = 'idle';
  let label = 'Omi offline';
  if (isError) {
    tone = 'danger';
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
  return (
    <span
      className="inline-flex items-center gap-2 text-[14px] text-ink"
      title="Source of the most recent transcript segments"
    >
      <StatusDot tone={tone} pulse={tone === 'live'} />
      <span>{label}</span>
      {data?.lastSegmentAt && (
        <span className="hidden font-mono text-[12px] text-muted sm:inline">{ago(data.lastSegmentAt)}</span>
      )}
    </span>
  );
}

function TopBar() {
  const { patients, patient, select } = usePatient();
  const setCtx = useSetContext(patient?.id);
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-canvas px-4 py-3 sm:px-6">
      <div className="flex items-center gap-2">
        <label htmlFor="patient" className="text-[14px] text-muted">
          Patient
        </label>
        <select
          id="patient"
          value={patient?.id ?? ''}
          onChange={(e) => select(e.target.value)}
          className="h-9 max-w-[220px] rounded-[10px] border border-border-strong bg-canvas px-2 text-[15px] text-ink"
        >
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </div>
      <Toggle
        label="Use personal memory"
        checked={patient?.contextEnabled ?? true}
        onChange={(v) => setCtx.mutate(v)}
        disabled={!patient || setCtx.isPending}
        labelOn="Memory on"
        labelOff="Memory off"
      />
      <div className="ml-auto">
        <OmiBadge userId={patient?.id} />
      </div>
    </header>
  );
}

function Sidebar() {
  const nav = useNavigate();
  const qc = useQueryClient();
  async function logout() {
    await unwrap(client.POST('/auth/logout')).catch(() => undefined);
    qc.clear();
    nav('/login', { replace: true });
  }
  return (
    <aside className="flex shrink-0 flex-col border-b border-border bg-surface md:w-56 md:border-b-0 md:border-r">
      <Link to="/" className="px-5 py-4 font-serif text-[26px] text-ink">
        Unsaid
      </Link>
      <nav
        aria-label="Console"
        className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:pb-0"
      >
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex h-11 shrink-0 items-center gap-2.5 rounded-[10px] px-3 text-[15px] font-medium',
                isActive
                  ? 'bg-canvas text-ink ring-1 ring-border'
                  : 'text-muted hover:bg-canvas hover:text-ink',
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="hidden p-3 md:block">
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted" onClick={logout}>
          <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
        </Button>
      </div>
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
      <div className="p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="mt-6 h-64 w-full" />
      </div>
    );
  if (me.isError) {
    const status = (me.error as { status?: number }).status;
    if (status === 401) return <Navigate to="/login" replace />;
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
      <div className="flex min-h-screen flex-col bg-canvas md:flex-row">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main id="main" className="min-w-0 flex-1 bg-canvas">
            <Outlet />
          </main>
        </div>
      </div>
    </PatientProvider>
  );
}
