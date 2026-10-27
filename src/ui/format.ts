const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
export const compact = (n: number) => (Number.isFinite(n) ? compactFmt.format(n) : '–');
export const money = (n: number) => `$${compact(n)}`;

/** Signed percentage change of `a` over `b`; 0 when b is 0. */
export function pctVs(a: number, b: number): number {
  return b > 0 ? ((a - b) / b) * 100 : 0;
}
export const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

export function clock(timeS: number): string {
  const h = Math.floor(((timeS / 3600) % 24 + 24) % 24), m = Math.floor(((timeS / 60) % 60 + 60) % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
