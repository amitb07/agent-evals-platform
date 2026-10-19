export const usd = (n: number | null | undefined, digits = 2): string =>
  n === null || n === undefined ? '—' : `$${n.toFixed(n !== 0 && Math.abs(n) < 0.01 ? 4 : digits)}`;

export const pct = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`;

export const num = (n: number | null | undefined, digits = 2): string =>
  n === null || n === undefined ? '—' : n.toFixed(digits);

export const signed = (n: number | null | undefined, digits = 2): string =>
  n === null || n === undefined
    ? '—'
    : `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`;

export const duration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  return s < 120 ? `${s.toFixed(1)} s` : `${(s / 60).toFixed(1)} min`;
};

export const tokens = (n: number | null | undefined): string =>
  n === null || n === undefined
    ? '—'
    : n >= 1000
      ? `${(n / 1000).toFixed(1)}k`
      : String(Math.round(n));

export const dateTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString() : '—';
