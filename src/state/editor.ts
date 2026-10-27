import { useStore } from './store';
import type { Edit } from '../model/solver';

export interface SubmitResult { applied: boolean; message?: string; recommendation?: Edit[] }

/** The design being edited follows the exploded node: n0 is the master, the rest are workers. */
export function editingRole(): 'worker' | 'master' {
  return useStore.getState().explodedNodeId === 'n0' ? 'master' : 'worker';
}

export function submitEdit(e: Edit): SubmitResult {
  const o = useStore.getState().applyDesignEdit(editingRole(), e);
  if (o.status === 'ok') return { applied: true };
  if (o.status === 'recommend') return { applied: false, message: o.message, recommendation: o.changes };
  return { applied: false, message: o.message };
}

export function acceptRecommendation() {
  useStore.getState().acceptRecommendation();
}
