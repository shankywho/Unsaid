import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from './cn';
import { Button } from './primitives';

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('skeleton', className)} aria-hidden="true" />
);

/** Loading rows with an accessible name. */
export function SkeletonList({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={cn('py-3.5', i > 0 && 'border-t border-line')}>
          <Skeleton className="mb-2 h-2.5 w-14" />
          <div
            className="skeleton h-3.5"
            style={{ width: `${[88, 70, 80, 62, 76][i % 5]}%` }}
            aria-hidden="true"
          />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** An empty screen says what belongs here and offers the action. */
export function EmptyState({
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
    <div className={cn('flex flex-col items-start gap-2.5 py-10', className)}>
      <h3 className="text-[20px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</h3>
      <p className="max-w-md text-[14px] text-muted">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Errors say what happened and how to fix it; they never apologise. */
export function ErrorState({
  title = 'Could not load this',
  detail,
  fix,
  requestId,
  onRetry,
  className,
}: {
  title?: string;
  detail?: string;
  fix?: string;
  requestId?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-2 py-6', className)}>
      <AlertTriangle className="h-5 w-5 text-danger" aria-hidden="true" />
      <p className="text-[20px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</p>
      {detail && <p className="max-w-md text-[14px] text-muted">{detail}</p>}
      {fix && <p className="max-w-md text-[14px] text-muted">{fix}</p>}
      {requestId && <p className="mono text-[11.5px] text-faint">x-request-id {requestId}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
