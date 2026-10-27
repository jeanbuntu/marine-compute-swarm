import { useStore } from '../state/store';
import type { Edit } from '../model/solver';
import { acceptRecommendation } from '../state/editor';

const editLabel = (e: Edit) => ('knob' in e ? e.knob : `${e.partId} ${e.field}`);
const f = (n: number) => Number(n.toFixed(2)).toString();

/** Explains a blocked edit and, when one exists, offers the other changes that make it workable. */
export function OutcomeBanner() {
  const outcome = useStore((s) => s.lastOutcome);
  const dismiss = useStore.getState().dismissOutcome;
  if (!outcome || outcome.outcome.status === 'ok') return null;
  const o = outcome.outcome;
  return (
    <div className="banner" role="alert">
      <b>{o.message}</b>
      {o.status === 'recommend' && (
        <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
          {o.changes.map((c, i) => <li key={i}>{editLabel(c)} → {f(c.value)}</li>)}
        </ul>
      )}
      <div className="row" style={{ marginTop: 6 }}>
        {o.status === 'recommend' && <button className="primary" onClick={acceptRecommendation}>Apply all</button>}
        <button onClick={dismiss}>Dismiss</button>
      </div>
    </div>
  );
}
