import type { NodeDesign } from '../parts';
import { PETAL_DIRS, PETAL_IDS, petalGeometry, PANEL_PASSIVE_TILT_DEG, type PetalId } from '../hardware';

type V = [number, number, number];
export type PetalAngles = Record<PetalId, number>;
export const PETAL_CLEARANCE_M = 0.008;
// Reserve headroom above the guaranteed swept clearance so a drive can reverse
// away from its stop without numerical sticking at the contact boundary.
const OPERATING_CLEARANCE_M = 0.012;
const RAD = Math.PI / 180;
const sub = (a: V, b: V): V => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const dot = (a: V, b: V) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: V, b: V): V => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

/** Conservative prism contains the rounded frame, glass AND underside rails.
 * A zero-thickness triangle test would miss rail/frame collisions. Coordinates
 * are relative to the common hinge elevation; hull attitude is a rigid transform. */
export function petalPrism(d: NodeDesign, id: PetalId, tiltDeg: number) {
  const g = petalGeometry(d), dir = PETAL_DIRS[id], c = Math.cos(tiltDeg*RAD), s = Math.sin(tiltDeg*RAD);
  const corners = [[0,-g.innerWidth/2],[g.length,-g.outerWidth/2],[g.length,g.outerWidth/2],[0,g.innerWidth/2]];
  const vertices: V[] = [];
  for (const y of [0.03, -0.06]) for (const [r,t] of corners) {
    const radial = g.root+r*c-y*s;
    vertices.push([dir[0]*radial-dir[2]*t, r*s+y*c, dir[2]*radial+dir[0]*t]);
  }
  const edges = corners.map((_,i) => sub(vertices[(i+1)%4], vertices[i]));
  const vertical = sub(vertices[4],vertices[0]);
  return { vertices, edges: [...edges,vertical], normals: [cross(edges[0],edges[1]), ...edges.map(e => cross(e,vertical))] };
}
type Prism = ReturnType<typeof petalPrism>;

/** Separating-axis theorem for convex prisms. A positive value is a certified
 * lower bound on separation; a negative value means the prisms intersect. */
export function prismSeparation(a: Prism, b: Prism): number {
  const gap = (axis: V) => {
    const len = Math.hypot(...axis);
    if (len < 1e-10) return -Infinity;
    const pa = a.vertices.map(p => dot(p,axis)/len), pb = b.vertices.map(p => dot(p,axis)/len);
    return Math.max(Math.min(...pb)-Math.max(...pa), Math.min(...pa)-Math.max(...pb));
  };
  const boxGap = Math.max(gap([1,0,0]), gap([0,1,0]), gap([0,0,1]));
  if (boxGap > 0.05) return boxGap;
  let best = boxGap;
  for (const axis of [...a.normals,...b.normals]) best = Math.max(best,gap(axis));
  for (const ea of a.edges) for (const eb of b.edges) best = Math.max(best,gap(cross(ea,eb)));
  return best;
}
export function minimumPetalClearance(d: NodeDesign, angles: PetalAngles): number {
  const shapes = PETAL_IDS.map(id => petalPrism(d,id,angles[id]));
  let clearance = Infinity;
  for (let i=0;i<shapes.length;i++) for (let j=i+1;j<shapes.length;j++) clearance = Math.min(clearance,prismSeparation(shapes[i],shapes[j]));
  return clearance;
}

/** Certifies the whole swept move, not just its end pose. Each vertex moves at
 * most radius*angle; twice that bounds relative motion of any two prisms.
 * Subdivide intervals that cannot be certified from their initial separation.
 * Stop conservatively at the first unsafe interval (no jumping through contact). */
export function limitPetalMotion(d: NodeDesign, from: PetalAngles, to: PetalAngles) {
  const delta = Math.max(...PETAL_IDS.map(id => Math.abs(to[id]-from[id]))) * RAD;
  const at = (t: number) => Object.fromEntries(PETAL_IDS.map(id => [id,from[id]+(to[id]-from[id])*t])) as PetalAngles;
  if (delta < 1e-12) return { angles: from, limited: false, fraction: 1 };
  // Each panel stays inside its own angular sector throughout this interval.
  // This analytical certificate covers normal travel without repeated SAT work.
  if (PETAL_IDS.every(id => Math.max(Math.abs(from[id]),Math.abs(to[id])) <= PANEL_PASSIVE_TILT_DEG)) return { angles:to,limited:false,fraction:1 };
  const start = minimumPetalClearance(d,from);
  // A drive already at its operating stop can hold immediately when the command
  // would reduce clearance. Reversal is still checked and allowed below.
  if (start < OPERATING_CLEARANCE_M+0.0001 && minimumPetalClearance(d,to) < OPERATING_CLEARANCE_M) return { angles:from,limited:true,fraction:0 };
  const radius = Math.hypot(d.petalLengthM,0.06);
  const visit = (a: number, b: number, separation: number, depth: number): number => {
    if (separation < OPERATING_CLEARANCE_M-1e-9) return a;
    const movement = 2*radius*delta*(b-a);
    if (separation-OPERATING_CLEARANCE_M > movement+1e-10) return b;
    // Small intervals are certified against the physical 8 mm floor, then their
    // end pose must restore the 12 mm operating margin. This permits reversing
    // out of a stop and cannot tunnel through a collision between safe endpoints.
    if (movement < (OPERATING_CLEARANCE_M-PETAL_CLEARANCE_M)/2 && minimumPetalClearance(d,at(b)) >= OPERATING_CLEARANCE_M) return b;
    if (depth === 14) return a;
    const mid = (a+b)/2;
    const left = visit(a,mid,separation,depth+1);
    if (left < mid) return left;
    return visit(mid,b,minimumPetalClearance(d,at(mid)),depth+1);
  };
  const fraction = visit(0,1,start,0);
  return { angles: at(fraction), limited: fraction < 1-1e-9, fraction };
}
