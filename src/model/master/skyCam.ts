import { mulberry32 } from '../rng';
import { wrapM, type Cloud } from '../sky';
import { bodyToWorld, worldToBody, type Attitude, type V3 } from './solar';

/**
 * The master's upward-looking fisheye camera: equidistant projection, image up = north at yaw 0.
 * Seen from below, east is on the LEFT of the picture (as in a real all-sky camera).
 */
export interface Lens { fovDeg: number; sizePx: number }
export const defaultLens = (): Lens => ({ fovDeg: 180, sizePx: 1024 });
const RAD = Math.PI / 180;
export type Pt = [number, number];

export function projectDir(att: Attitude, dirWorld: V3, lens: Lens): { px: Pt; theta: number; inside: boolean } {
  const b = worldToBody(att, dirWorld);
  const len = Math.hypot(...b) || 1;
  const theta = Math.acos(Math.max(-1, Math.min(1, b[1] / len)));
  const rN = theta / ((lens.fovDeg / 2) * RAD), s = Math.hypot(b[0], b[2]) || 1, half = lens.sizePx / 2;
  const rc = Math.min(rN, 1);
  return { px: [half + ((-b[0] / s) * rc * half), half + ((b[2] / s) * rc * half)], theta, inside: rN <= 1 };
}
/** Inverse: pixel to a world direction; null outside the lens circle. */
export function unprojectPx(att: Attitude, px: Pt, lens: Lens): V3 | null {
  const half = lens.sizePx / 2, u = (px[0] - half) / half, v = (px[1] - half) / half, r = Math.hypot(u, v);
  if (r > 1) return null;
  const th = r * (lens.fovDeg / 2) * RAD, s = r < 1e-9 ? 0 : Math.sin(th) / r;
  return bodyToWorld(att, [-u * s, Math.cos(th), v * s]);
}

export interface GtCloud { id: number; polygon: Pt[]; centroid: Pt; bbox: [number, number, number, number]; altM: number; radiusM: number; opacity: number; coversZenith: boolean; areaPx: number; distM: number }

const RIM = 40;
/** Analytic ground truth: each cloud footprint is a disc at mid-height, projected through the lens (approximate for puffy cumulus). */
export function groundTruth(clouds: Cloud[], nodeEastM: number, nodeNorthM: number, camAltM: number, att: Attitude, lens: Lens): GtCloud[] {
  const out: GtCloud[] = [];
  for (const c of clouds) {
    const dx = wrapM(c.x - nodeEastM), dy = wrapM(c.y - nodeNorthM), alt = c.altM + c.thicknessM * 0.5 - camAltM;
    const dist = Math.hypot(dx, dy);
    if (dist - c.radiusM > 22000) continue;
    const r = c.radiusM >= 1500 ? c.radiusM : c.radiusM * 1.15;
    const poly: Pt[] = [];
    for (let i = 0; i < RIM; i++) {
      const a = (i / RIM) * 2 * Math.PI;
      poly.push(projectDir(att, [dx + r * Math.cos(a), alt, -(dy + r * Math.sin(a))], lens).px);
    }
    const centre = projectDir(att, [dx, alt, -dy], lens);
    const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    const bbox: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const covers = dist < r;
    const area = polygonArea(poly);
    if (!covers && (bbox[2] - bbox[0] < 4 || (!centre.inside && bbox[0] > lens.sizePx) )) continue;
    out.push({ id: c.id, polygon: poly, centroid: centre.px, bbox, altM: c.altM, radiusM: c.radiusM, opacity: c.opacity, coversZenith: covers, areaPx: area, distM: dist });
  }
  return out.filter((g) => g.bbox[2] >= 0 && g.bbox[0] <= lens.sizePx && g.bbox[3] >= 0 && g.bbox[1] <= lens.sizePx);
}

export function polygonArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
  return Math.abs(a) / 2;
}
export function pointInPolygon(x: number, y: number, p: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
  }
  return inside;
}
const GRID = 96;
export function rasterize(p: Pt[], lens: Lens): Uint8Array {
  const m = new Uint8Array(GRID * GRID), k = lens.sizePx / GRID;
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) / k)), x1 = Math.min(GRID - 1, Math.ceil(Math.max(...xs) / k));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) / k)), y1 = Math.min(GRID - 1, Math.ceil(Math.max(...ys) / k));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (pointInPolygon((x + 0.5) * k, (y + 0.5) * k, p)) m[y * GRID + x] = 1;
  return m;
}
export function iou(a: Uint8Array, b: Uint8Array): number {
  let i = 0, u = 0;
  for (let k = 0; k < a.length; k++) { if (a[k] && b[k]) i++; if (a[k] || b[k]) u++; }
  return u === 0 ? 0 : i / u;
}

export interface Detection { polygon: Pt[]; bbox: [number, number, number, number]; centroid: Pt; score: number; sourceIds: number[]; kind: 'cloud' | 'merged' | 'glare' | 'spurious' }
export interface SegParams { boundaryNoisePx: number; centerNoisePx: number; dropRate: number; mergeRate: number; glare: boolean; spuriousPerFrame: number; minAreaPx: number }
export const defaultSeg = (): SegParams => ({ boundaryNoisePx: 4, centerNoisePx: 3, dropRate: 0.05, mergeRate: 0.25, glare: true, spuriousPerFrame: 0.3, minAreaPx: 700 });

const centroidOf = (p: Pt[]): Pt => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
const bboxOf = (p: Pt[]): [number, number, number, number] => { const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const mk = (polygon: Pt[], score: number, sourceIds: number[], kind: Detection['kind']): Detection => ({ polygon, bbox: bboxOf(polygon), centroid: centroidOf(polygon), score, sourceIds, kind });
function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());

/**
 * Stand-in for SAM output with the failure modes that matter for tracking: ragged edges, offset masks,
 * missed thin cloud, neighbours merged into one mask, a glare blob at the sun and the odd spurious blob.
 */
export function simulateSegmenter(gt: GtCloud[], sunPx: Pt | null, p: SegParams, lens: Lens, seed: number): Detection[] {
  const rnd = mulberry32(seed >>> 0);
  const out: Detection[] = [];
  const near = (a: GtCloud, b: GtCloud) => Math.hypot(a.centroid[0] - b.centroid[0], a.centroid[1] - b.centroid[1]) < (Math.sqrt(a.areaPx) + Math.sqrt(b.areaPx)) * 0.45;
  const used = new Set<number>();
  const list = gt.filter((g) => !g.coversZenith || g.areaPx < lens.sizePx * lens.sizePx * 0.9);
  for (const g of list) {
    if (used.has(g.id) || g.areaPx < p.minAreaPx) continue;
    const thin = 1 - Math.min(1, g.opacity / 0.8);
    if (rnd() < p.dropRate + thin * 0.35) continue;
    let polys = [g.polygon], ids = [g.id], kind: Detection['kind'] = 'cloud';
    const other = list.find((o) => o.id !== g.id && !used.has(o.id) && near(g, o));
    if (other && rnd() < p.mergeRate) { polys = [g.polygon, other.polygon]; ids = [g.id, other.id]; kind = 'merged'; used.add(other.id); }
    const pts = polys.length > 1 ? hull(polys.flat()) : g.polygon;
    // errors on a given cloud are mostly persistent from frame to frame (same edges, same bias), with a small fresh jitter
    const bias = mulberry32(g.id * 977 + 5), c = centroidOf(pts);
    const dx = (gauss(bias) + 0.3 * gauss(rnd)) * p.centerNoisePx, dy = (gauss(bias) + 0.3 * gauss(rnd)) * p.centerNoisePx;
    const noisy = pts.map((q): Pt => {
      const rr = Math.hypot(q[0] - c[0], q[1] - c[1]) || 1, j = (gauss(bias) + 0.3 * gauss(rnd)) * p.boundaryNoisePx;
      return [q[0] + dx + ((q[0] - c[0]) / rr) * j, q[1] + dy + ((q[1] - c[1]) / rr) * j];
    });
    out.push(mk(noisy, Math.max(0.2, Math.min(0.99, 0.55 + g.opacity * 0.4 - thin * 0.2 + gauss(rnd) * 0.03)), ids, kind));
    used.add(g.id);
  }
  if (p.glare && sunPx) {
    const r = lens.sizePx * 0.03;
    out.push(mk(Array.from({ length: 16 }, (_, i): Pt => [sunPx[0] + r * Math.cos((i / 16) * 2 * Math.PI), sunPx[1] + r * Math.sin((i / 16) * 2 * Math.PI)]), 0.4, [], 'glare'));
  }
  if (rnd() < p.spuriousPerFrame) {
    const a = rnd() * 2 * Math.PI, rad = Math.sqrt(rnd()) * lens.sizePx * 0.42, r = lens.sizePx * (0.015 + rnd() * 0.03), cx = lens.sizePx / 2 + rad * Math.cos(a), cy = lens.sizePx / 2 + rad * Math.sin(a);
    out.push(mk(Array.from({ length: 12 }, (_, i): Pt => [cx + r * Math.cos((i / 12) * 2 * Math.PI), cy + r * Math.sin((i / 12) * 2 * Math.PI)]), 0.25, [], 'spurious'));
  }
  return out;
}

export interface Track { id: number; centroid: Pt; velPxS: Pt; age: number; missed: number; sourceIds: number[] }
/**
 * Nearest-centroid association, solved globally (closest pairs first) with a gate that scales with mask size,
 * so a big cloud tolerates more jitter than a speck. Persistent ids; velocity is a damped estimate.
 */
export class MaskTracker {
  tracks: Track[] = [];
  private nextId = 1;
  constructor(private gatePx: number) {}
  update(dets: Detection[], dtS: number): Map<Detection, Track> {
    const out = new Map<Detection, Track>();
    const pairs: { t: Track; d: Detection; dist: number }[] = [];
    for (const t of this.tracks) {
      const pred: Pt = [t.centroid[0] + t.velPxS[0] * dtS, t.centroid[1] + t.velPxS[1] * dtS];
      for (const d of dets) {
        const dist = Math.hypot(d.centroid[0] - pred[0], d.centroid[1] - pred[1]);
        const gate = Math.min(this.gatePx, Math.max(12, 0.8 * Math.sqrt(polygonArea(d.polygon))));
        if (dist < gate) pairs.push({ t, d, dist });
      }
    }
    pairs.sort((a, b) => a.dist - b.dist);
    const usedT = new Set<Track>(), usedD = new Set<Detection>();
    for (const { t, d } of pairs) {
      if (usedT.has(t) || usedD.has(d)) continue;
      usedT.add(t); usedD.add(d);
      const dt = Math.max(dtS, 1e-3), v: Pt = [(d.centroid[0] - t.centroid[0]) / dt, (d.centroid[1] - t.centroid[1]) / dt];
      t.velPxS = [t.velPxS[0] * 0.85 + v[0] * 0.15, t.velPxS[1] * 0.85 + v[1] * 0.15];
      t.centroid = d.centroid; t.age++; t.missed = 0; t.sourceIds = d.sourceIds; out.set(d, t);
    }
    for (const t of this.tracks) if (!usedT.has(t)) t.missed++;
    for (const d of dets) if (!usedD.has(d)) {
      const t: Track = { id: this.nextId++, centroid: d.centroid, velPxS: [0, 0], age: 1, missed: 0, sourceIds: d.sourceIds };
      this.tracks.push(t); out.set(d, t);
    }
    this.tracks = this.tracks.filter((t) => t.missed < 8);
    return out;
  }
  reset() { this.tracks = []; this.nextId = 1; }
}

export interface FrameMetrics { gt: number; det: number; matched: number; recall: number; precision: number; meanIou: number; merged: number; falsePositives: number; centroidErrPx: number }
export function evaluateFrame(allGt: GtCloud[], dets: Detection[], lens: Lens, minIou = 0.4): FrameMetrics {
  const masks = allGt.map((g) => rasterize(g.polygon, lens));
  const keep = allGt.map((_, i) => i).filter((i) => masks[i].some(Boolean)); // clouds smaller than one raster cell cannot be scored
  const gt = keep.map((i) => allGt[i]), gtM = keep.map((i) => masks[i]), dM = dets.map((d) => rasterize(d.polygon, lens));
  const takenG = new Set<number>(), takenD = new Set<number>();
  const pairs: { g: number; d: number; v: number }[] = [];
  gt.forEach((_, gi) => dets.forEach((__, di) => { const v = iou(gtM[gi], dM[di]); if (v >= minIou) pairs.push({ g: gi, d: di, v }); }));
  pairs.sort((a, b) => b.v - a.v);
  let sum = 0, err = 0;
  for (const q of pairs) {
    if (takenG.has(q.g) || takenD.has(q.d)) continue;
    takenG.add(q.g); takenD.add(q.d); sum += q.v;
    err += Math.hypot(gt[q.g].centroid[0] - dets[q.d].centroid[0], gt[q.g].centroid[1] - dets[q.d].centroid[1]);
  }
  const matched = takenG.size;
  return {
    gt: gt.length, det: dets.length, matched, recall: gt.length ? matched / gt.length : 1, precision: dets.length ? matched / dets.length : 1,
    meanIou: matched ? sum / matched : 0, merged: dets.filter((d) => d.kind === 'merged').length,
    falsePositives: dets.filter((d, i) => !takenD.has(i) && (d.kind === 'glare' || d.kind === 'spurious')).length, centroidErrPx: matched ? err / matched : 0,
  };
}

/** Counts how often one ground-truth cloud changes track id between frames. */
export class IdentityLog {
  private last = new Map<number, number>(); switches = 0; frames = 0;
  add(dets: Detection[], tracks: Map<Detection, Track>) {
    this.frames++;
    for (const d of dets) {
      if (d.sourceIds.length !== 1) continue;
      const t = tracks.get(d); if (!t) continue;
      const prev = this.last.get(d.sourceIds[0]);
      if (prev !== undefined && prev !== t.id) this.switches++;
      this.last.set(d.sourceIds[0], t.id);
    }
  }
  reset() { this.last.clear(); this.switches = 0; this.frames = 0; }
}

export interface FrameExport { version: 1; t: number; prompt: string; model: string; lens: Lens; attitudeDeg: { yaw: number; pitch: number; roll: number }; sunPx: Pt | null; groundTruth: Pick<GtCloud, 'id' | 'polygon' | 'centroid' | 'bbox' | 'altM' | 'radiusM' | 'opacity'>[]; note: string }
export function buildExport(t: number, prompt: string, model: string, lens: Lens, att: Attitude, sunPx: Pt | null, gt: GtCloud[]): FrameExport {
  return {
    version: 1, t, prompt, model, lens, attitudeDeg: { yaw: att.yaw / RAD, pitch: att.pitch / RAD, roll: att.roll / RAD }, sunPx,
    groundTruth: gt.map(({ id, polygon, centroid, bbox, altM, radiusM, opacity }) => ({ id, polygon, centroid, bbox, altM, radiusM, opacity })),
    note: 'Ground truth is the analytic footprint disc of each cloud at mid-height, projected through the lens; approximate for puffy cumulus. Image x runs right, y runs down; east is on the left.',
  };
}
/** Accepts {detections:[{polygon,score}]} written by an offline segmentation run (pixel coordinates of the exported frame). */
export function parseDetections(json: unknown): Detection[] {
  const arr = (json as { detections?: unknown }).detections;
  if (!Array.isArray(arr)) throw new Error('expected {"detections":[{"polygon":[[x,y],...],"score":0.9}]}');
  return arr.map((d, i) => {
    const poly = (d as { polygon?: unknown }).polygon;
    if (!Array.isArray(poly) || poly.length < 3 || !poly.every((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite))) throw new Error(`detection ${i}: polygon must be at least 3 [x,y] points`);
    return mk(poly as Pt[], Number((d as { score?: number }).score ?? 0.5), [], 'cloud');
  });
}
