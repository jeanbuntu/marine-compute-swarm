import { hexSlots } from '../model/swarm';

export const SWARM_INTRO_NODES = 3;
export const SWARM_INTRO_DETAIL_M = 240;
/** Meter-scale isometric framing shared by the live home preview and the Swarm entry view. */
export function swarmIntro(aspect = 16 / 9, spacingM = 40, count = SWARM_INTRO_NODES) {
  const slots = hexSlots(Math.max(1, Math.min(SWARM_INTRO_NODES, count)), spacingM);
  return frameSwarmNodes(slots.map(p=>[p[0],-p[1]] as [number,number]),aspect);
}

export function frameSwarmNodes(points:[number,number][],aspect=16/9) {
  const slots=points.length?points:[[0,0]];
  const target: [number, number, number] = [slots.reduce((sum,p)=>sum+p[0],0)/slots.length, .4, slots.reduce((sum,p)=>sum+p[1],0)/slots.length];
  const tanV=Math.tan(25*Math.PI/180),tanH=tanV*Math.max(.2,aspect);
  let distance=12;
  // Fit the actual projected hardware envelopes, rather than a distant sphere around the fleet.
  for(const p of slots)for(const dx of [-4,4])for(const dy of [-3,3])for(const dz of [-4,4]){
    const x=p[0]+dx-target[0],y=dy-target[1],z=p[1]+dz-target[2];
    const depth=(x+y+z)/Math.sqrt(3),right=(x-z)/Math.sqrt(2),up=(-x+2*y-z)/Math.sqrt(6);
    distance=Math.max(distance,depth+Math.abs(right)/(tanH*.86),depth+Math.abs(up)/(tanV*.86));
  }
  const offset=distance/Math.sqrt(3);
  const position: [number, number, number] = [target[0]+offset,target[1]+offset,target[2]+offset];
  return {position,target};
}
