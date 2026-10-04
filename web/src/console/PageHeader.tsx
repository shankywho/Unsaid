import type { ReactNode } from 'react';

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-6 pt-8">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
        {sub && <p className="mt-1.5 max-w-xl text-[14px] text-muted">{sub}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2.5">{right}</div>}
    </header>
  );
}
