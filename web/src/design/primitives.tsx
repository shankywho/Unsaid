import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from './cn';

/* ---------- Signature: broken -> whole ---------- */

/** A patient fragment: dim mono. Always this look. */
export function Fragment({ children, className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('font-mono text-[14px] leading-6 tracking-normal text-muted', className)} {...rest}>
      {children}
    </span>
  );
}

const SIZES = {
  md: 'text-[26px] leading-[1.2]',
  lg: 'text-[32px] leading-[1.15]',
  xl: 'text-[34px] leading-[1.12] sm:text-[40px]',
} as const;

/** A resolved sentence: large bright sans. `glow` adds the faint accent glow used for confirmed speech. */
export function Resolved({
  children,
  size = 'lg',
  glow = false,
  as: Tag = 'p',
  className,
}: {
  children: ReactNode;
  size?: keyof typeof SIZES;
  glow?: boolean;
  as?: 'p' | 'h1' | 'h2' | 'h3' | 'div';
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        'font-medium tracking-[-0.04em] text-balance',
        glow ? 'sentence text-white' : 'text-ink',
        SIZES[size],
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function Wordmark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('wm text-ink', className)} style={{ fontSize: size }}>
      Unsaid
      <span className="wm-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

/** Small section heading: sentence case, never a fragment. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[13px] font-medium text-muted', className)}>{children}</p>;
}

/* ---------- Buttons ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'xl';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-ink text-canvas border border-transparent hover:bg-white',
  secondary: 'bg-raised text-ink border border-line-strong hover:bg-white/[0.07]',
  ghost: 'bg-transparent text-ink border border-line-strong hover:bg-white/[0.05]',
  danger: 'bg-danger-soft text-danger border border-danger-line hover:bg-danger/20',
};
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-3.5 text-[14px]',
  lg: 'h-11 px-5 text-[15px]',
  xl: 'h-[76px] px-8 text-[20px] font-semibold tracking-[-0.02em] rounded-[10px]',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ variant = 'primary', size = 'md', className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[8px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    />
  );
});

/* ---------- Surfaces and chips ---------- */

/** A bordered window. One level only; inside it use rows and dividers. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[10px] border border-line-strong bg-surface', className)} {...rest} />;
}

export function Tag({
  children,
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'danger';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-[5px] border border-line-strong px-1.5 text-[11px] font-medium text-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'live' | 'danger';
  className?: string;
}) {
  const tones = {
    neutral: 'border-line-strong text-muted',
    live: 'border-accent-line bg-accent-soft text-accent',
    danger: 'border-danger-line bg-danger-soft text-danger',
  };
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[6px] border px-2 text-[12px] font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Latencies, scores and ids are always monospaced. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('mono text-[12px] tabular-nums text-faint', className)}>{children}</span>;
}

export function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function LatencyChip({ ms, className }: { ms?: number | null; className?: string }) {
  if (ms === undefined || ms === null) return null;
  return <span className={cn('mono text-[12px] tabular-nums text-muted', className)}>{fmtMs(ms)}</span>;
}

export function ScoreBar({ score, label }: { score: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  return (
    <span
      className="inline-flex items-center gap-2"
      role="img"
      aria-label={`${label ?? 'score'} ${score.toFixed(2)}`}
    >
      <span className="h-[3px] w-12 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full rounded-full bg-muted" style={{ width: `${pct}%` }} />
      </span>
      <span className="mono w-8 text-right text-[12px] tabular-nums text-muted">{score.toFixed(2)}</span>
    </span>
  );
}

export function StatusDot({
  tone,
  pulse = false,
}: {
  tone: 'live' | 'idle' | 'danger' | 'sim' | 'done' | 'pending';
  pulse?: boolean;
}) {
  const style = {
    live: 'bg-accent',
    done: 'bg-muted',
    idle: 'bg-ghost',
    sim: 'border-[1.5px] border-faint bg-transparent',
    pending: 'border-[1.5px] border-ghost bg-transparent',
    danger: 'bg-danger',
  }[tone];
  return <span aria-hidden="true" className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', style, pulse && 'pulse')} />;
}

/** A real switch (button role=switch), not a pill. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50',
        checked ? 'bg-ink' : 'bg-white/[0.16]',
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-4 w-4 rounded-full transition-transform duration-200',
          checked ? 'translate-x-4 bg-canvas' : 'bg-muted',
        )}
      />
    </button>
  );
}

/** Custom select: a trigger plus a list of buttons. No native chrome, no ARIA widget roles to misuse. */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  lead,
  className,
  menuClassName,
}: {
  value: T | undefined;
  options: Array<{ value: T; label: string; hint?: string }>;
  onChange: (v: T) => void;
  label: string;
  lead?: (selected?: { value: T; label: string }) => ReactNode;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 w-full items-center gap-2.5 rounded-[8px] border border-line-strong bg-surface pl-1.5 pr-2.5 text-[14px] font-medium text-ink hover:bg-white/[0.04]"
      >
        {lead?.(selected)}
        <span className={cn('flex-1 truncate text-left', !lead && 'pl-2')}>{selected?.label ?? '—'}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={id}
          className={cn(
            'absolute left-0 top-[calc(100%+4px)] z-40 w-64 rounded-[10px] border border-line-strong bg-raised p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.7)]',
            menuClassName,
          )}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={cn(
                'flex min-h-9 w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[14px]',
                o.value === value ? 'bg-white/[0.06] text-ink' : 'text-muted hover:bg-white/[0.04] hover:text-ink',
              )}
            >
              <span className="flex-1">
                {o.label}
                {o.hint && <span className="block text-[12px] text-faint">{o.hint}</span>}
              </span>
              {o.value === value && <Check className="h-4 w-4" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const inputClass =
  'h-9 w-full rounded-[8px] border border-line-strong bg-surface px-3 text-[14px] text-ink placeholder:text-faint focus-visible:border-white/40';

/** Minimal waveform; static bars when idle or under reduced motion. */
export function Waveform({ active, bars = 26 }: { active: boolean; bars?: number }) {
  return (
    <span className="inline-flex h-8 flex-1 items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => {
        const h = active ? 5 + Math.round(Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)) * 22) : 3;
        return (
          <span
            key={i}
            className={cn('w-[3px] rounded-full', active ? 'wave-bar bg-accent' : 'bg-accent/50')}
            style={{ height: h, animationDelay: `${(i % 5) * 120}ms` }}
          />
        );
      })}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mono rounded-[5px] border border-line-strong bg-white/[0.03] px-1.5 py-px text-[11px] font-medium text-muted">
      {children}
    </kbd>
  );
}
