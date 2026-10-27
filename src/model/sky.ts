import { mulberry32 } from './rng';

export const DOMAIN_M = 24000; // clouds live on a wrapping square of this side

export interface SkyConfig {
  seed: number;
  coverage: number; // 0..1
  windMs: [number, number]; // east, north
  latDeg: number;
  lonDeg: number;
  doy?: number; // day of year, default 200
}
export interface Cloud { id: number; x: number; y: number; altM: number; radiusM: number; thicknessM: number; opacity: number }
export interface SunState { elevDeg: number; azDeg: number; ghiWm2: number }
export interface Sky {
  clouds(t: number): Cloud[];
  shadowFactor(t: number, x: number, y: number): number;
  sun(t: number): SunState;
}

const RAD = Math.PI / 180;
export const wrapM = (v: number) => ((((v + DOMAIN_M / 2) % DOMAIN_M) + DOMAIN_M) % DOMAIN_M) - DOMAIN_M / 2;
const MIN_ELEV_DEG = 5; // cap shadow throw near the horizon

export function makeSky(c: SkyConfig): Sky {
  const rnd = mulberry32(c.seed);
  const range = (a: number, b: number) => a + (b - a) * rnd();
  const base: Cloud[] = [];
  const cov = Math.min(Math.max(c.coverage, 0), 1);
  let id = 0;

  if (cov >= 0.999) {
    base.push({ id: id++, x: 0, y: 0, altM: 500, radiusM: DOMAIN_M, thicknessM: 300, opacity: 0.65 });
  } else if (cov > 0) {
    // Poisson-style area budget: covered fraction = 1 - exp(-n * area / domain area).
    const budget = (-Math.log(1 - cov) * DOMAIN_M * DOMAIN_M) * 0.8; // calibrated for overlap and soft edges
    const kinds = [
      { share: 0.4, r: [2500, 4000], alt: [350, 600], th: [100, 200], op: [0.45, 0.6] },
      { share: 0.6, r: [250, 900], alt: [1200, 2200], th: [300, 800], op: [0.75, 0.9] },
    ];
    for (const k of kinds) {
      const meanR2 = ((k.r[0] ** 2 + k.r[0] * k.r[1] + k.r[1] ** 2) / 3) * Math.PI;
      const n = Math.round((budget * k.share) / meanR2);
      for (let i = 0; i < n; i++) {
        base.push({
          id: id++, x: range(-DOMAIN_M / 2, DOMAIN_M / 2), y: range(-DOMAIN_M / 2, DOMAIN_M / 2),
          altM: range(k.alt[0], k.alt[1]), radiusM: range(k.r[0], k.r[1]),
          thicknessM: range(k.th[0], k.th[1]), opacity: range(k.op[0], k.op[1]),
        });
      }
    }
  }

  const doy = c.doy ?? 200;
  const decl = 23.44 * RAD * Math.sin((2 * Math.PI * (284 + doy)) / 365);
  const lat = c.latDeg * RAD;

  const sun = (t: number): SunState => {
    const hour = (((t / 3600) % 24) + 24) % 24; // t is local solar seconds
    const H = 15 * (hour - 12) * RAD;
    const sinE = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
    const elev = Math.asin(Math.min(1, Math.max(-1, sinE)));
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;
    const ghi = elev > 0 ? 1050 * Math.sin(elev) ** 1.2 : 0; // EST clear-sky GHI
    return { elevDeg: elev / RAD, azDeg: ((az / RAD) % 360 + 360) % 360, ghiWm2: ghi };
  };

  const clouds = (t: number): Cloud[] =>
    base.map((b) => ({ ...b, x: wrapM(b.x + c.windMs[0] * t), y: wrapM(b.y + c.windMs[1] * t) }));

  const shadowFactor = (t: number, x: number, y: number): number => {
    if (base.length === 0) return 1;
    const s = sun(t);
    const tanE = Math.tan(Math.max(s.elevDeg, MIN_ELEV_DEG) * RAD);
    const sx = Math.sin(s.azDeg * RAD), sy = Math.cos(s.azDeg * RAD);
    let f = 1;
    for (const b of base) {
      const throwM = b.altM / tanE;
      const cx = wrapM(b.x + c.windMs[0] * t) - sx * throwM;
      const cy = wrapM(b.y + c.windMs[1] * t) - sy * throwM;
      const d = Math.hypot(wrapM(x - cx), wrapM(y - cy));
      if (d >= b.radiusM) continue;
      const edge = d <= b.radiusM * 0.7 ? 1 : 1 - (d - b.radiusM * 0.7) / (b.radiusM * 0.3);
      f *= 1 - b.opacity * edge;
    }
    return f;
  };

  return { clouds, shadowFactor, sun };
}
