type V3 = [number, number, number];

/** Focus centers the node once; following only adds its motion, preserving manual panning. */
export function followDelta(anchor: V3, previousAnchor: V3 | null, target: V3, focusing: boolean): V3 {
  if (focusing) return anchor.map((v, i) => (v - target[i]) * 0.12) as V3;
  return previousAnchor ? anchor.map((v, i) => v - previousAnchor[i]) as V3 : [0, 0, 0];
}
