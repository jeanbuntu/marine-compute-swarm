import { create } from 'zustand';
import { MasterSim, type MasterParams } from '../model/master/masterSim';
import { SEA_PRESETS, type SeaPreset } from '../model/master/waves';
import { defaultLens, defaultSeg, type Detection, type FrameExport, type FrameMetrics, type GtCloud, type Lens, type SegParams, type Track } from '../model/master/skyCam';

/** Live master-node simulation; the scene reads it every frame. */
export const msim = new MasterSim();

export type ViewMode = 'close' | 'under' | 'top' | 'sky';
export type CamModel = 'SAM 3' | 'SAM 3.1';

export interface Analysis {
  gt: GtCloud[]; dets: Detection[]; tracks: Map<Detection, Track>; metrics: FrameMetrics | null; sunPx: [number, number] | null; source: 'simulated' | 'imported';
  avg: FrameMetrics | null; idSwitches: number; frames: number;
}

interface MasterUi {
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

const q = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);
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
  const cx = LEFT_W + 8, cw = Math.max(200, w - LEFT_W - RIGHT_W - 16), cy = TOP_H + 8, ch = Math.max(200, h - TOP_H - 16);
  const main: Rect = { x: cx, y: cy, w: cw, h: ch };
  const pipSize = Math.min(300, Math.floor(Math.min(cw, ch) * 0.42));
  const pipRect: Rect = { x: cx + 10, y: cy + ch - pipSize - 10, w: pipSize, h: pipSize };
  if (view === 'sky') {
    const side = Math.min(cw, ch);
    return { main, fisheye: { x: cx + (cw - side) / 2, y: cy + (ch - side) / 2, w: side, h: side }, scene: pip ? pipRect : null };
  }
  return { main, fisheye: pip ? pipRect : null, scene: main };
}
