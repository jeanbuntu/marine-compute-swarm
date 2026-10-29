import { useEffect, useRef } from 'react';
import { msim, useMaster, type Analysis } from '../../state/master';
import { IdentityLog, MaskTracker, evaluateFrame, groundTruth, polygonArea, projectDir, simulateSegmenter, type FrameMetrics, type GtCloud } from '../../model/master/skyCam';
import { sunVector } from '../../model/master/solar';

const CAM_ALT_M = 1.5;
const mix = (a: number, b: number) => a * 0.8 + b * 0.2;

/** Runs the sky-camera pipeline at 4 Hz: ground truth, segmentation (simulated or imported), tracking and scoring. */
export function useSkyAnalysis() {
  const lastInputs = useRef<unknown[]>([]);
  const tracker = useRef(new MaskTracker(60)), ident = useRef(new IdentityLog()), frame = useRef(0), avg = useRef<FrameMetrics | null>(null);
  useEffect(() => {
    const h = setInterval(() => {
      const st = useMaster.getState(), lens = st.lens, tel = msim.telemetry;
      const inputs = [st.lens, st.seg, st.imported, st.params, msim.tSky, msim.tPhys];
      if (st.paused && st.analysis && inputs.every((value,i)=>value===lastInputs.current[i])) return;
      lastInputs.current = inputs;
      let gt: GtCloud[], dets, source: Analysis['source'], sunPx: [number, number] | null = null;
      const sp = projectDir(tel.att, sunVector(tel.sun.azDeg, tel.sun.elevDeg), lens);
      if (tel.sun.elevDeg > 0 && sp.inside) sunPx = sp.px;
      if (st.imported?.frame) {
        gt = st.imported.frame.groundTruth.map((g) => ({ ...g, coversZenith: false, areaPx: polygonArea(g.polygon), distM: 0 }));
        dets = st.imported.dets; source = 'imported'; sunPx = st.imported.frame.sunPx;
      } else {
        gt = groundTruth(msim.sky.clouds(msim.tSky), msim.pos[0], -msim.pos[1], CAM_ALT_M, tel.att, lens).filter((g) => g.coversZenith || g.areaPx >= st.seg.minAreaPx);
        dets = simulateSegmenter(gt, sunPx, st.seg, lens, st.paused ? frame.current : ++frame.current); source = 'simulated';
      }
      const tracks = st.paused ? (st.analysis?.tracks ?? new Map()) : tracker.current.update(dets, 0.25);
      if (!st.paused) ident.current.add(dets, tracks);
      const m = evaluateFrame(gt, dets, lens);
      const a = avg.current;
      avg.current = a ? { gt: m.gt, det: m.det, matched: m.matched, merged: m.merged, falsePositives: m.falsePositives, recall: mix(a.recall, m.recall), precision: mix(a.precision, m.precision), meanIou: mix(a.meanIou, m.meanIou), centroidErrPx: mix(a.centroidErrPx, m.centroidErrPx) } : m;
      useMaster.getState().set({ analysis: { gt, dets, tracks, metrics: m, avg: avg.current, sunPx, source, idSwitches: ident.current.switches, frames: ident.current.frames } });
    }, 250);
    return () => clearInterval(h);
  }, []);
  return {
    reset() { tracker.current.reset(); ident.current.reset(); avg.current = null; },
  };
}
