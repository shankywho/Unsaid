import { forwardRef, type ButtonHTMLAttributes, type ReactNode, type HTMLAttributes } from 'react';
import { cn } from './cn';

/* ---------- The signature: broken -> whole ---------- */

/** A patient fragment: small, muted, monospaced, with ellipses. Always this look. */
export function Fragment({ children, className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('font-mono text-[14px] leading-6 tracking-tight text-muted', className)} {...rest}>
      {children}
    </span>
  );
}

const SIZES = {
  md: 'text-[24px] leading-[1.25]',
  lg: 'text-[32px] leading-[1.15]',
  xl: 'text-[44px] leading-[1.08] sm:text-[56px]',
} as const;

/** A resolved sentence: large serif, ink. `marked` adds the amber rule used for confirmed speech. */
export function Resolved({
  children,
  size = 'lg',
  marked = false,
  as: Tag = 'p',
  className,
}: {
  children: ReactNode;
  size?: keyof typeof SIZES;
  marked?: boolean;
  as?: 'p' | 'h1' | 'h2' | 'h3' | 'div';
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        'font-serif font-normal tracking-[-0.01em] text-ink text-balance',
        SIZES[size],
        marked && 'border-l-[3px] border-accent pl-4',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Section label written as a fragment that the headline below completes. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('font-mono text-[13px] tracking-tight text-muted', className)}>{children}</p>;
}

/* ---------- Buttons ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'xl';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-[#2a2a2c] border border-ink',
  secondary: 'bg-canvas text-ink border border-border-strong hover:bg-surface',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-surface',
  danger: 'bg-canvas text-danger border border-[#e6c3bf] hover:bg-danger-soft',
};
const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3 text-[14px]',
  md: 'h-11 px-4 text-[15px]',
  lg: 'h-12 px-6 text-[16px]',
  xl: 'min-h-[72px] px-10 text-[20px] font-medium',
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
        'inline-flex items-center justify-center gap-2 rounded-[12px] font-sans font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    />
  );
});

/* ---------- Surfaces ---------- */

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[14px] border border-border bg-canvas', className)} {...rest} />;
}

export function Tag({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'danger';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-surface text-muted border-border',
    accent: 'bg-accent-soft text-accent-text border-[#f3d9ae]',
    success: 'bg-success-soft text-success border-[#cfe0d3]',
    danger: 'bg-danger-soft text-danger border-[#ecc9c5]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[13px] font-medium leading-5',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Latencies and ids are always monospaced. */
export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[13px] tabular-nums text-muted', className)}>{children}</span>;
}

export function LatencyChip({ ms }: { ms?: number | null }) {
  if (ms === undefined || ms === null) return null;
  const label = ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
  return (
    <span className="inline-flex rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[12px] tabular-nums text-muted">
      {label}
    </span>
  );
}

export function ScoreBar({ score, label }: { score: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  return (
    <span
      className="inline-flex items-center gap-2"
      role="img"
      aria-label={`${label ?? 'score'} ${score.toFixed(2)}`}
    >
      <span className="h-1 w-12 overflow-hidden rounded-full bg-border">
        <span className="block h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-[12px] tabular-nums text-muted">{score.toFixed(2)}</span>
    </span>
  );
}

export function StatusDot({
  tone,
  pulse = false,
}: {
  tone: 'live' | 'ok' | 'idle' | 'danger' | 'sim';
  pulse?: boolean;
}) {
  const color = {
    live: 'bg-accent',
    ok: 'bg-success',
    idle: 'bg-border-strong',
    danger: 'bg-danger',
    sim: 'bg-muted',
  }[tone];
  return (
    <span className="relative inline-flex h-2 w-2" aria-hidden="true">
      {pulse && (
        <span
          className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-50', color)}
        />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  );
}

/** Pill switch. Real <button role="switch"> so it is keyboard- and screen-reader-operable. */
export function Toggle({
  checked,
  onChange,
  labelOn,
  labelOff,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelOn: string;
  labelOff: string;
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
        'inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[14px] font-medium transition-colors duration-150 disabled:opacity-50',
        checked ? 'border-ink bg-ink text-white' : 'border-border-strong bg-canvas text-ink',
      )}
    >
      <span
        className={cn('h-2 w-2 rounded-full', checked ? 'bg-white' : 'bg-border-strong')}
        aria-hidden="true"
      />
      {checked ? labelOn : labelOff}
    </button>
  );
}

/** Minimal waveform; static bars when idle or under reduced motion. */
export function Waveform({ active, bars = 24 }: { active: boolean; bars?: number }) {
  return (
    <span className="inline-flex h-8 items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => {
        const h = 8 + ((i * 37) % 17) + (i % 3) * 3;
        return (
          <span
            key={i}
            className={cn('w-[3px] rounded-full', active ? 'wave-bar bg-accent' : 'bg-border-strong')}
            style={{ height: h, animationDelay: `${(i % 8) * 90}ms` }}
          />
        );
      })}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-border-strong bg-surface px-1.5 py-0.5 font-mono text-[12px] text-muted">
      {children}
    </kbd>
  );
}
