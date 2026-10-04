import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from './cn';
import { Button, Fragment } from './primitives';

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('skeleton', className)} aria-hidden="true" />
);

/** Loading block with an accessible name; `lines` skeleton rows. */
export function SkeletonList({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** An empty screen is an invitation to act: say what belongs here and offer the action. */
export function EmptyState({
  fragment,
  title,
  body,
  action,
  className,
}: {
  fragment?: string;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-[14px] border border-dashed border-border-strong bg-surface p-8',
        className,
      )}
    >
      {fragment && <Fragment>{fragment}</Fragment>}
      <h3 className="font-serif text-[28px] leading-tight text-ink">{title}</h3>
      <p className="max-w-md text-[16px] text-muted">{body}</p>
      {action}
    </div>
  );
}

/** Errors say what happened and how to fix it; they never apologise. */
export function ErrorState({
  title = 'Could not load this',
  detail,
  fix,
  onRetry,
  className,
}: {
  title?: string;
  detail?: string;
  fix?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-[14px] border border-[#ecc9c5] bg-danger-soft p-5',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium text-danger">{title}</p>
        {detail && <p className="text-[15px] text-ink">{detail}</p>}
        {fix && <p className="text-[15px] text-muted">{fix}</p>}
        {onRetry && (
          <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
