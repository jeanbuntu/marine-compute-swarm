import { evaluateWorst } from './hydrostatics';
import type { NodeDesign } from './parts';

export type Knob = 'batteryKg' | 'computeKg' | 'ballastKg' | 'hullDepthM' | 'keelDepthM' | 'petalLengthM' | 'hullSideM';
export type Edit =
  | { knob: Knob; value: number }
  | { partId: string; field: 'massKg' | 'posY'; value: number };
export type Outcome =
  | { status: 'ok'; design: NodeDesign }
  | { status: 'recommend'; message: string; changes: Edit[]; design: NodeDesign }
  | { status: 'infeasible'; message: string; closest?: Edit; design: NodeDesign };

export const KNOB_RANGE: Record<Knob, [number, number]> = {
  batteryKg: [20, 1000], computeKg: [10, 200], ballastKg: [0, 600],
  hullDepthM: [0.5, 1.5], keelDepthM: [0.15, 0.8], petalLengthM: [0.4, 2.0], hullSideM: [1.0, 2.5],
};
const KNOBS = Object.keys(KNOB_RANGE) as Knob[];
const PART_OF: Partial<Record<Knob, string>> = { batteryKg: 'battery', computeKg: 'compute-pod', ballastKg: 'ballast' };
const PART_RANGE = { massKg: [0, 5000], posY: [0, 3] } as const;
const GRID = 9;

export function knobValue(d: NodeDesign, k: Knob): number {
  const id = PART_OF[k];
  if (id) return d.parts.find((p) => p.id === id)?.massKg ?? 0;
  return ({ hullDepthM: d.hullDepthM, keelDepthM: d.keelDepthM, petalLengthM: d.petalLengthM, hullSideM: d.hullSideM } as Record<string, number>)[k];
}

function apply(d: NodeDesign, e: Edit): NodeDesign {
  if ('knob' in e) {
    const id = PART_OF[e.knob];
    if (id) return { ...d, parts: d.parts.map((p) => (p.id === id ? { ...p, massKg: e.value } : p)) };
    return { ...d, [e.knob]: e.value };
  }
  return {
    ...d,
    parts: d.parts.map((p) =>
      p.id !== e.partId ? p : e.field === 'massKg' ? { ...p, massKg: e.value } : { ...p, pos: [p.pos[0], e.value, p.pos[2]] },
    ),
  };
}

const label = (e: Edit) => ('knob' in e ? e.knob : `${e.partId}.${e.field}`);
const valueOf = (e: Edit) => e.value;
const rangeOf = (e: Edit): [number, number] => ('knob' in e ? KNOB_RANGE[e.knob] : [...PART_RANGE[e.field]]);
const ok = (d: NodeDesign) => evaluateWorst(d).ok;
const fmt = (n: number) => Number(n.toFixed(2));

/** Largest-magnitude value along the edit's axis that is still stable, moving from the current value. */
function closestEdit(base: NodeDesign, e: Edit, from: number): Edit {
  const [lo, hi] = rangeOf(e);
  const target = Math.min(hi, Math.max(lo, e.value));
  let good = from, bad = target;
  if (ok(apply(base, { ...e, value: target }))) return { ...e, value: target };
  for (let i = 0; i < 40; i++) {
    const mid = (good + bad) / 2;
    if (ok(apply(base, { ...e, value: mid }))) good = mid; else bad = mid;
  }
  return { ...e, value: good };
}

function currentValue(d: NodeDesign, e: Edit): number {
  if ('knob' in e) return knobValue(d, e.knob);
  const p = d.parts.find((x) => x.id === e.partId);
  return p ? (e.field === 'massKg' ? p.massKg : p.pos[1]) : 0;
}

/** Smallest set (up to 3) of other-knob changes that restores stability, by normalized change. */
function search(d: NodeDesign, edited: Edit): Edit[] | null {
  const editedKnob = 'knob' in edited ? edited.knob : null;
  const free = KNOBS.filter((k) => k !== editedKnob);
  const cands = free.map((k) => {
    const [lo, hi] = KNOB_RANGE[k];
    const cur = knobValue(d, k);
    const vals = Array.from({ length: GRID }, (_, i) => lo + ((hi - lo) * i) / (GRID - 1)).filter((v) => Math.abs(v - cur) > 1e-9);
    return { k, vals, cost: (v: number) => Math.abs(v - cur) / (hi - lo) };
  });
  for (let size = 1; size <= 3; size++) {
    let best: { cost: number; changes: Edit[] } | null = null;
    const walk = (start: number, chosen: { i: number; v: number }[], design: NodeDesign) => {
      if (chosen.length === size) {
        if (ok(design)) {
          const cost = chosen.reduce((s, c) => s + cands[c.i].cost(c.v), 0);
          if (!best || cost < best.cost) best = { cost, changes: chosen.map((c) => ({ knob: cands[c.i].k, value: fmt(c.v) })) };
        }
        return;
      }
      for (let i = start; i < cands.length; i++) {
        for (const v of cands[i].vals) walk(i + 1, [...chosen, { i, v }], apply(design, { knob: cands[i].k, value: v }));
      }
    };
    walk(0, [], d);
    if (best) return (best as { changes: Edit[] }).changes;
  }
  return null;
}

export function applyEdit(design: NodeDesign, e: Edit): Outcome {
  if (!Number.isFinite(e.value) || e.value < 0) {
    return { status: 'infeasible', message: `Invalid value for ${label(e)}.`, design };
  }
  const [lo, hi] = rangeOf(e);
  if (e.value < lo || e.value > hi) {
    const closest = closestEdit(design, e, currentValue(design, e));
    const d2 = apply(design, closest);
    return {
      status: 'infeasible', closest, design: ok(d2) ? d2 : design,
      message: `${label(e)} must stay within ${lo} to ${hi}; this would break hydrodynamic stability. Closest workable value: ${fmt(closest.value)}.`,
    };
  }
  const applied = apply(design, e);
  if (ok(applied)) return { status: 'ok', design: applied };

  const others = search(applied, e);
  if (others) {
    const changes = [e, ...others];
    const final = changes.reduce(apply, design);
    return {
      status: 'recommend', changes, design: final,
      message: `This would break hydrodynamic stability. To use ${label(e)} = ${valueOf(e)}, also change: ${others.map((c) => `${label(c)} to ${fmt(valueOf(c))}`).join(', ')}.`,
    };
  }
  const closest = closestEdit(design, e, currentValue(design, e));
  return {
    status: 'infeasible', closest, design: apply(design, closest),
    message: `This would break hydrodynamic stability and no combination of the other knobs fixes it. Closest workable value: ${fmt(closest.value)}.`,
  };
}
