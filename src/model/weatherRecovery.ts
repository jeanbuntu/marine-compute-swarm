import type { NodeDesign } from './parts';
import { recoveryPose } from './recovery';

export interface RightingState {
  phase: 'Ready' | 'Isolating' | 'Inflating' | 'Rolling' | 'Verifying' | 'Upright' | 'Failed';
  elapsedS: number; progress: number; rollDeg: number; inflation: number; gasAvailable: boolean;
}
export const initialRighting = (): RightingState => ({phase:'Ready',elapsedS:0,progress:0,rollDeg:0,inflation:0,gasAvailable:true});
/** Conditional mechanism state machine, not a hydrodynamic righting solution. */
export function advanceRighting(previous:RightingState,inverted:boolean,ingress:boolean,operational:boolean,powered:boolean,dt:number,design:NodeDesign) {
  if(!inverted)return {state:previous,inverted:false,fire:false};
  if(previous.phase==='Failed')return {state:previous,inverted:true,fire:false};
  const restarting=previous.phase==='Ready'||previous.phase==='Upright';
  const elapsedS=(restarting?0:previous.elapsedS)+dt;
  const missing=!design.parts.some(p=>p.id==='recovery-cassette')||!design.parts.some(p=>p.id==='safety-controller');
  if(ingress||!powered||missing||(restarting&&!previous.gasAvailable))return {state:{...previous,phase:'Failed' as const,rollDeg:180},inverted:true,fire:false};
  const progress=.16+.84*Math.min(1,elapsedS/60), pose=recoveryPose(progress);
  const fire=previous.gasAvailable && progress>=.32;
  if(!operational && progress>=.32)return {state:{...previous,phase:'Failed' as const,elapsedS,progress,rollDeg:180,gasAvailable:false},inverted:true,fire};
  const phase:RightingState['phase']=elapsedS>=60?'Upright':progress>=.88?'Verifying':progress>=.54?'Rolling':progress>=.32?'Inflating':'Isolating';
  return {state:{phase,elapsedS,progress,rollDeg:pose.roll*180/Math.PI,inflation:pose.inflation,gasAvailable:previous.gasAvailable&&!fire},inverted:elapsedS<60,fire};
}
export function weatherSun(t:number,scenario:string) {
  const totalHour=(scenario==='night'?18:10)+t/3600;
  const hour=((totalHour%24)+24)%24;
  const ghi=850*Math.max(0,Math.sin((hour-6)*Math.PI/12));
  return {hour,day:Math.floor(totalHour/24)+1,ghi:ghi<1e-6?0:ghi,secondsToSunrise:((6-hour+24)%24)*3600};
}
