import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { sim } from '../state/sim';
import { FOOTPRINT_M } from '../model/tracker';
import { cameraPanelRect } from './camPanel';

const FRAME_PX = 640; // tracker frame size
const ARROW_S = 90; // seconds of motion drawn as an arrow

/** HTML overlay for the node camera picture: tracked-cloud boxes, motion arrows, and the navigator's reason. */
export function NodeCameraPanel() {
  const [bounds,setBounds] = useState({w:window.innerWidth,h:window.innerHeight});
  useEffect(()=>{
    const root=document.querySelector('[data-swarm-viewport]');
    if(!root)return;
    const measure=()=>{const r=root.getBoundingClientRect();if(r.width&&r.height)setBounds({w:r.width,h:r.height});};measure();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(measure);observer.observe(root);return()=>observer.disconnect();
  },[]);
  const CAM=cameraPanelRect(bounds.w,bounds.h),K=CAM.size/FRAME_PX;
  const id = useStore((s) => s.selectedNodeId);
  const [, tick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(h);
  }, []);

  if (!id) {
    return <div className="panel camera-placeholder" style={{ left: CAM.left, bottom: CAM.bottom, width: CAM.size }}><span className="dim">Select a node to see its sky camera.</span></div>;
  }
  const tracked = sim.lastTracked[id] ?? [];
  const cmd = sim.lastCmds.find((c) => c.nodeId === id);
  const node = sim.swarm.nodes.find((n) => n.id === id);
  const mPerPx = (2 * FOOTPRINT_M) / FRAME_PX;

  return (
    <div style={{ position: 'absolute', left: CAM.left, bottom: CAM.bottom, width: CAM.size, height: CAM.size + 62 }}>
      <div className="panel" style={{ position: 'absolute', left: 0, top: 0, width: CAM.size, height: 58, padding: '8px 12px', borderRadius: '12px 12px 0 0' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <b>Sky camera · {id}</b>
          <button onClick={() => useStore.getState().select(null)}>Close</button>
        </div>
        <div className="dim" style={{ fontSize: 12 }}>
          {tracked.length} clouds tracked · {cmd?.reason ?? 'waiting for first decision'}
        </div>
      </div>
      <svg width={CAM.size} height={CAM.size} style={{ position: 'absolute', left: 0, bottom: 0, border: '1px solid rgba(160,200,255,0.3)', borderRadius: '0 0 12px 12px', pointerEvents: 'none' }} viewBox={`0 0 ${CAM.size} ${CAM.size}`}>
        {tracked.map((c) => {
          const [x0, y0, x1, y1] = c.bbox.map((v) => v * K);
          const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
          const ax = cx + (c.velocityMs[0] * ARROW_S) / mPerPx * K, ay = cy - (c.velocityMs[1] * ARROW_S) / mPerPx * K;
          return (
            <g key={c.id}>
              <rect data-cloud={c.id} x={x0} y={y0} width={Math.max(2, x1 - x0)} height={Math.max(2, y1 - y0)} fill="none" stroke={c.confidence > 0.7 ? '#4fd1c5' : '#ffc247'} strokeWidth={1.2} />
              <line x1={cx} y1={cy} x2={ax} y2={ay} stroke="#ffffff" strokeWidth={1.2} />
              <text x={x0 + 2} y={y0 + 10} fontSize={9} fill="#fff">#{c.id}</text>
            </g>
          );
        })}
        {node && <circle cx={CAM.size / 2} cy={CAM.size / 2} r={3} fill="#ffc247" />}
      </svg>
    </div>
  );
}
