import * as D from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { Button } from './primitives';

/** Radix dialog (focus trap, escape, aria) in the dark style. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-[rgba(5,5,6,0.66)]" />
        <D.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-line-strong bg-surface p-7 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]">
          <D.Title className="text-[20px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {title}
          </D.Title>
          <D.Description className="mt-2.5 text-[14px] text-muted">{description}</D.Description>
          <div className="mt-5">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  busy,
  children,
  confirmDisabled,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      {children}
      <div className="mt-6 flex justify-end gap-2.5">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy || confirmDisabled}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
