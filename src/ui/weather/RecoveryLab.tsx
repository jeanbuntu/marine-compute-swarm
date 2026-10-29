import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import type { RightingState } from '../../model/weatherRecovery';
import type { NodeDesign } from '../../model/parts';
import { evaluateWorst } from '../../model/hydrostatics';
import { partMassKg } from '../../model/nodeDesign';
import { RECOVERY_STAGES, recoveryHardware, recoveryPose } from '../../model/recovery';
import { hasWebGL } from '../../scene/webgl';
import type { RecoveryDetail } from '../../scene/weather/RecoveryScene';
const RecoveryScene=lazy(() => import('../../scene/weather/RecoveryScene').then(m=>({default:m.RecoveryScene})));

class SceneBoundary extends Component<{children: ReactNode},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed ? <div className="r-fallback">The 3D renderer is unavailable. Use the recovery stages and component descriptions below.</div> : this.props.children;}
}
const PARTS=[['recovery-cassette','Bag & hatch'],['righting-gas','Gas supply'],['safety-controller','Isolation'],['ballast','Low ballast'],['distress-beacon','Distress pod'],['perimeter-bumper','Bumper'],['thruster-1','Guarded drive']] as const;
export function RecoveryLab({ design, nodeId, swell, inverted, ingress, onClose, liveRighting, fleetPlaying = true, playbackSpeed = 1 }: { design:NodeDesign; nodeId:string; swell:number; inverted:boolean; ingress:boolean; onClose():void; liveRighting?:RightingState; fleetPlaying?:boolean; playbackSpeed?:number }) {
  const [webgl]=useState(hasWebGL);
  const [progress,setProgress]=useState(0),[playing,setPlaying]=useState(false),[detail,setDetail]=useState<RecoveryDetail>('assembly');
  const [focus,setFocus]=useState<string|null>(null),[callouts,setCallouts]=useState(true);
  const [bagFailed,setBagFailed]=useState(false);
  const [followLive,setFollowLive]=useState(!!liveRighting&&liveRighting.phase!=='Ready');
  const isLive=followLive&&!!liveRighting;
  const actualBagFailed=isLive?liveRighting.phase==='Failed':bagFailed;
  const actualProgress=isLive?(liveRighting.phase==='Failed'?Math.max(.16,Math.min(.54,liveRighting.progress)):liveRighting.progress):bagFailed ? Math.min(progress,.54) : progress;
  const failureActive=actualBagFailed&&(isLive||actualProgress>=.32);
  const pose=recoveryPose(actualProgress), hardware=recoveryHardware(design), hydro=evaluateWorst(design);
  const stage=RECOVERY_STAGES[pose.stage], selectedPart=design.parts.find(p=>p.id===focus);
  useEffect(() => {
    if(!playing || !fleetPlaying)return;
    const id=window.setInterval(()=>setProgress(p=>{const next=Math.min(1,p+.004*playbackSpeed);return next;}),80);
    return()=>window.clearInterval(id);
  },[playing,fleetPlaying,playbackSpeed]);
  useEffect(()=>{if(progress>=1 || (bagFailed && progress>=.54))setPlaying(false);},[progress,bagFailed]);
  return <section className="recovery-lab" aria-label="3D recovery close-up">
    <header className="r-header"><div><div className="w-eyebrow">RECOVERY BENCH / {nodeId} · {design.role.toUpperCase()}</div><h2>See the recovery, component by component.</h2></div><button onClick={onClose}>Close close-up</button></header>
    <div className="r-layout"><div>
      <div className="r-toolbar"><div role="group" aria-label="Recovery detail level">{(['assembly','cutaway','mechanism'] as const).map((v,i)=><button key={v} aria-pressed={detail===v} onClick={()=>setDetail(v)}>0{i+1} {v==='assembly'?'Assembly':v==='cutaway'?'Cutaway':'Mechanism'}</button>)}</div><button aria-pressed={callouts} onClick={()=>setCallouts(!callouts)}>Callouts</button></div>
      <div className="r-canvas">
        {webgl ? <SceneBoundary><Suspense fallback={<div className="r-fallback">Loading shared 3D hardware…</div>}><RecoveryScene design={design} progress={actualProgress} detail={detail} focus={focus??stage.part} swell={swell} callouts={callouts} bagFailed={actualBagFailed} /></Suspense></SceneBoundary> : <div className="r-fallback"><b>3D requires WebGL</b><p>The recovery timeline and hardware inspection remain available.</p></div>}
        <span className="r-view-label">{detail==='assembly'?'WATERLINE / SHARED HARDWARE':detail==='cutaway'?'TRANSPARENT SHELL / INTERNAL ROUTING':'MECHANISM / PANELS HIDDEN FOR VISIBILITY'}</span>
        <span className="r-orbit-hint">Drag to orbit · Scroll to zoom · Right-drag to pan</span>
      </div>
      <div className="r-playback">{liveRighting&&<label><input type="checkbox" checked={followLive} onChange={e=>setFollowLive(e.target.checked)} />Follow live node</label>}<button disabled={isLive} onClick={()=>{if(progress>=1)setProgress(0);setPlaying(!playing);}}>{playing?'Pause replay':'Play replay'}</button><button disabled={isLive} onClick={()=>{setProgress(0);setPlaying(false);}}>Reset sequence</button><label>Recovery sequence<input aria-label="Recovery sequence" disabled={isLive} type="range" min="0" max="1" step="0.001" value={actualProgress} onChange={e=>{setPlaying(false);setProgress(Number(e.target.value));}} /></label><output>{Math.round(actualProgress*100)}%</output></div>
      <div className="r-stages">{RECOVERY_STAGES.map((s,i)=><button disabled={isLive} key={s.label} aria-current={pose.stage===i?'step':undefined} onClick={()=>{setPlaying(false);setProgress(s.at);setFocus(s.part);}}><small>0{i+1}</small>{s.label}</button>)}</div>
    </div><aside className="r-explanation"><span className="w-eyebrow">{failureActive?'FAILURE BRANCH':`STAGE 0${pose.stage+1}`}</span><h2>{failureActive?'Bag unavailable. Retrieve.':stage.label}</h2><p>{failureActive?'Without inflation the concept stays inverted. Keep propulsion isolated and request physical retrieval; a beacon may have no sky view.':stage.detail}</p>
      <div className="r-status"><div>Propulsion <b>{pose.propulsionIsolated?'ISOLATED':'READY → TRIP ON INVERSION'}</b></div><div>Gas charge <b>{pose.needsService?'SERVICE REQUIRED':'ARMED · CONCEPT'}</b></div><div>Fleet node <b>{isLive?`${liveRighting.phase.toUpperCase()} · LIVE`:ingress?'INGRESS / RESTART BLOCKED':inverted?'INVERTED / NOT AUTO-CLEARED':'UNCHANGED BY REPLAY'}</b></div></div>
      <label className="r-failure-toggle"><input type="checkbox" disabled={isLive} checked={bagFailed} onChange={e=>{setBagFailed(e.target.checked);setProgress(0);setPlaying(false);}} /> Test inflation failure</label>
      <div className="w-section-title">INSPECT THE HARDWARE</div><div className="r-parts">{PARTS.map(([id,label])=><button key={id} aria-pressed={focus===id} onClick={()=>{setFocus(id);setDetail(['righting-gas','safety-controller','ballast'].includes(id)?'cutaway':'mechanism');}}>{label}</button>)}</div>
      {selectedPart && <div className="r-part-note"><b>{selectedPart.name}</b><p>{selectedPart.rationale}</p></div>}
      <div className="r-specs"><span>{partMassKg(design).toFixed(1)} kg total</span><span>{hardware.massKg.toFixed(1)} kg recovery package + 3.2 kg drive guards</span><span>{(hardware.bagVolumeM3*1000).toFixed(0)} L bag envelope · EST</span><span>Worst static GM {hydro.gmM.toFixed(2)} m · {hydro.ok?'passes upright checks':'outside upright limits'}</span></div>
    </aside></div>
    <p className="r-disclaimer">Mechanism replay, not a hydrodynamic prediction. Timing and roll are prescribed. Panels are locked in the displayed deployed pose; no folding animation or clearance-certified bag deployment is claimed. Bag volume is geometry, not guaranteed submerged buoyancy. Gas sizing, righting-arm curve, antenna availability and wave-basin recovery tests remain open. Follow live node reads the same state machine as the 2D map. Manual replay never clears a fleet fault; automatic recovery is a conditional mechanism assumption, and ingress or failure still requires retrieval. <a href="https://rnli.org/magazine/magazine-featured-list/2021/november/how-do-lifeboats-self-right" target="_blank" rel="noreferrer">Inflatable righting precedent ↗</a></p>
  </section>;
}
