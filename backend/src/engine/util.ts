/** Shared formatting helpers used by detection reasons and explanation templates. */

export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

export function fmtPct(p: number | null | undefined): string {
  if (p === null || p === undefined) return '—';
  const pct = Math.round(p * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

export function directionWord(p: number | null | undefined): string {
  if (p === null || p === undefined) return 'changed';
  return p < 0 ? 'down' : 'up';
}
