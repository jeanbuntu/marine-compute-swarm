type V3 = [number, number, number];

function vec(s: string | null): V3 | null {
  if (!s) return null;
  const p = s.split(',').map(Number);
  return p.length === 3 && p.every(Number.isFinite) ? (p as V3) : null;
}

/** Optional starting view from the address: ?cam=x,y,z&target=x,y,z&explode=n0 */
export function readUrlState(search: string): { cam: V3 | null; target: V3 | null; explode: string | null } {
  const q = new URLSearchParams(search);
  const explode = q.get('explode');
  return { cam: vec(q.get('cam')), target: vec(q.get('target')), explode: explode && /^n\d+$/.test(explode) ? explode : null };
}
