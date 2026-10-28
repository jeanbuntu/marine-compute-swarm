import { create } from 'zustand';
import { useStore } from './store';
import { MasterSim, type MasterParams } from '../model/master/masterSim';
import { SEA_PRESETS, type SeaPreset } from '../model/master/waves';
import { defaultLens, defaultSeg, type Detection, type FrameExport, type FrameMetrics, type GtCloud, type Lens, type SegParams, type Track } from '../model/master/skyCam';

/** Live master-node simulation; the scene reads it every frame. */
const q = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
const initialRole = q.get('view') === 'master' || q.get('role') !== 'worker' ? 'master' : 'worker';
export const msim = new MasterSim(undefined, useStore.getState().designs[initialRole]);

export type ViewMode = 'close' | 'under' | 'top' | 'sky';
export type CamModel = 'SAM 3' | 'SAM 3.1';

export interface Analysis {
  gt: GtCloud[]; dets: Detection[]; tracks: Map<Detection, Track>; metrics: FrameMetrics | null; sunPx: [number, number] | null; source: 'simulated' | 'imported';
  avg: FrameMetrics | null; idSwitches: number; frames: number;
}

interface MasterUi {
  role: 'master' | 'worker';
  dimensions: boolean;
  controlsOpen: boolean;
  analysisOpen: boolean;
  exploded: boolean;
  selectedPart: string;
  focusRequest: number;
  setRole(role: 'master' | 'worker'): void;
  params: MasterParams;
  view: ViewMode;
  pip: boolean;
  paused: boolean;
  cutaway: boolean;
  particles: boolean;
  normals: boolean;
  tab: 'petals' | 'propulsion' | 'sky';
  lens: Lens;
  seg: SegParams;
  prompt: string;
  model: CamModel;
  layers: { gt: boolean; dets: boolean; tracks: boolean; compass: boolean; sun: boolean };
  analysis: Analysis | null;
  imported: { dets: Detection[]; frame: FrameExport | null } | null;
  exportFrame: FrameExport | null;
  exportRequest: number;
  error: string | null;
  setParams(patch: Partial<MasterParams>): void;
  patchSun(patch: Partial<MasterParams['sun']>): void;
  patchSky(patch: Partial<MasterParams['sky']>): void;
  patchSea(patch: Partial<MasterParams['sea']>): void;
  patchActuator(patch: Partial<MasterParams['actuator']>): void;
  set(patch: Partial<MasterUi>): void;
}

// Shareable starting conditions: ?az=95&el=12 pins the sun, ?sea=storm picks a sea state, ?wind=18 sets the wind.
{
  const az = Number(q.get('az')), el = Number(q.get('el')), sea = q.get('sea') as SeaPreset | null, wind = q.get('wind');
  if (q.has('az') && q.has('el') && Number.isFinite(az) && Number.isFinite(el)) msim.set({ sun: { ...msim.params.sun, mode: 'manual', azDeg: az, elevDeg: el } });
  if (sea && sea in SEA_PRESETS) msim.set({ sea: { ...msim.params.sea, ...SEA_PRESETS[sea] } });
  if (wind && Number.isFinite(Number(wind))) msim.set({ windMs: Number(wind) });
}
const startView = (['close', 'under', 'top', 'sky'] as const).find((v) => v === q.get('mview')) ?? 'close';
const startTab = (['petals', 'propulsion', 'sky'] as const).find((v) => v === q.get('tab')) ?? 'petals';

export const useMaster = create<MasterUi>((set, get) => ({
  role: initialRole, controlsOpen: false, analysisOpen: typeof window !== 'undefined' && window.innerWidth >= 1100, dimensions: false, exploded: false, selectedPart: 'hull-shell', focusRequest: 0,
  setRole(role) {
    msim.design = useStore.getState().designs[role]; msim.rebuild(); msim.resetMotion(); msim.step(0);
    set({ role, selectedPart: 'hull-shell', analysis: null, imported: null });
    const url = new URL(window.location.href); url.searchParams.set('view', 'unit'); url.searchParams.set('role', role);
    window.history.replaceState(null, '', url);
  },
  params: msim.params, view: startView, pip: true, paused: false, cutaway: true, particles: true, normals: true, tab: startTab,
  lens: defaultLens(), seg: defaultSeg(), prompt: 'clouds', model: 'SAM 3.1',
  layers: { gt: true, dets: true, tracks: true, compass: true, sun: true },
  analysis: null, imported: null, exportFrame: null, exportRequest: 0, error: null,
  setParams(patch) { msim.set(patch); set({ params: msim.params }); },
  patchSun(patch) { get().setParams({ sun: { ...msim.params.sun, ...patch } }); },
  patchSky(patch) { get().setParams({ sky: { ...msim.params.sky, ...patch } }); },
  patchSea(patch) { get().setParams({ sea: { ...msim.params.sea, ...patch } }); },
  patchActuator(patch) { get().setParams({ actuator: { ...msim.params.actuator, ...patch } }); },
  set(patch) { set(patch); },
}));

/** Screen rectangles (CSS px, origin top-left) the render loop and the HTML overlays must agree on. */
export interface Rect { x: number; y: number; w: number; h: number }
export const LEFT_W = 330, RIGHT_W = 390, TOP_H = 56;
export function layoutRects(w: number, h: number, view: ViewMode, pip: boolean): { main: Rect; fisheye: Rect | null; scene: Rect | null } {
  const ui = useMaster.getState(); pip = pip && !ui.exploded;
  const compact = w < 900;
  const top = w < 480 ? 200 : w < 720 ? 144 : w < 1280 ? 96 : TOP_H;
  const left = !compact && ui.controlsOpen ? LEFT_W : 0, right = !compact && ui.analysisOpen ? RIGHT_W : 0;
  const bottom = compact && (ui.controlsOpen || ui.analysisOpen) ? Math.min(340, h * 0.42) + 8 : 0;
  const cx = left + 8, cw = Math.max(120, w - left - right - 16), cy = top + 8, ch = Math.max(120, h - top - bottom - 16);
  const main: Rect = { x: cx, y: cy, w: cw, h: ch };
  const pipSize = Math.min(300, Math.floor(Math.min(cw, ch) * 0.42));
  const pipRect: Rect = { x: cx + 10, y: cy + ch - pipSize - 10, w: pipSize, h: pipSize };
  if (view === 'sky') {
    const side = Math.min(cw, ch);
    return { main, fisheye: { x: cx + (cw - side) / 2, y: cy + (ch - side) / 2, w: side, h: side }, scene: pip ? pipRect : null };
  }
  return { main, fisheye: pip ? pipRect : null, scene: main };
}

useStore.subscribe((state) => {
  const design = state.designs[useMaster.getState().role];
  if (design !== msim.design) { msim.design = design; msim.rebuild(); msim.step(0); useMaster.getState().set({}); }
});
