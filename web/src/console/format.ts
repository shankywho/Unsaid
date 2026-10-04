export const fmtTime = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
export const pct = (n: number, d: number): string => (d === 0 ? '0%' : `${((n / d) * 100).toFixed(1)}%`);
export const ms = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`);
