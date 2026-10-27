import { create } from 'zustand';
import { defaultConfig, ScenarioConfig } from '../model/config';
import { masterDesign, workerDesign } from '../model/nodeDesign';
import type { NodeDesign } from '../model/parts';
import { applyEdit, type Edit, type Outcome } from '../model/solver';

type Role = 'worker' | 'master';
export interface PendingOutcome { role: Role; edit: Edit; outcome: Outcome }

interface State {
  config: ScenarioConfig;
  designs: Record<Role, NodeDesign>;
  selectedNodeId: string | null;
  hoveredId: string | null; // node id or part id
  explodedNodeId: string | null;
  selectedPartId: string | null;
  drawerOpen: boolean;
  inspectionExploded: boolean;
  playing: boolean;
  speed: number; // simulated seconds per real second
  timeS: number;
  lastOutcome: PendingOutcome | null;
  setConfig(patch: Partial<ScenarioConfig>): boolean;
  applyDesignEdit(role: Role, e: Edit): Outcome;
  acceptRecommendation(): void;
  dismissOutcome(): void;
  select(id: string | null): void;
  hover(id: string | null): void;
  explode(id: string | null): void;
  selectPart(id: string | null): void;
  setDrawer(open: boolean): void;
  setInspectionExploded(exploded: boolean): void;
  setPlaying(p: boolean): void;
  setSpeed(s: number): void;
  setTime(t: number): void;
  reset(): void;
}

const initial = () => ({
  config: defaultConfig(),
  designs: { worker: workerDesign(), master: masterDesign() },
  selectedNodeId: null, hoveredId: null, explodedNodeId: null, selectedPartId: null,
  inspectionExploded: true, drawerOpen: false, playing: true, speed: 120, timeS: 9 * 3600, lastOutcome: null,
});

export const useStore = create<State>((set, get) => ({
  ...initial(),
  setConfig(patch) {
    const r = ScenarioConfig.safeParse({ ...get().config, ...patch });
    if (!r.success) return false;
    set({ config: r.data });
    return true;
  },
  applyDesignEdit(role, e) {
    const o = applyEdit(get().designs[role], e);
    if (o.status === 'ok') set({ designs: { ...get().designs, [role]: o.design }, lastOutcome: null });
    else set({ lastOutcome: { role, edit: e, outcome: o } });
    return o;
  },
  acceptRecommendation() {
    const p = get().lastOutcome;
    if (!p || p.outcome.status !== 'recommend') return;
    set({ designs: { ...get().designs, [p.role]: p.outcome.design }, lastOutcome: null });
  },
  dismissOutcome: () => set({ lastOutcome: null }),
  select: (id) => set({ selectedNodeId: id }),
  hover: (id) => set({ hoveredId: id }),
  explode: (id) => set({ explodedNodeId: id, selectedPartId: null, selectedNodeId: id ?? get().selectedNodeId, lastOutcome: null }),
  selectPart: (id) => set({ selectedPartId: id }),
  setInspectionExploded: (inspectionExploded) => set({ inspectionExploded }),
  setDrawer: (open) => set({ drawerOpen: open }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setTime: (timeS) => set({ timeS }),
  reset: () => set(initial()),
}));
