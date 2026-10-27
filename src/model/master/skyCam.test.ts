import { describe, expect, it } from 'vitest';
import { makeSky } from '../sky';
import { buildExport, defaultLens, defaultSeg, evaluateFrame, groundTruth, IdentityLog, MaskTracker, parseDetections, projectDir, simulateSegmenter, unprojectPx, type Detection } from './skyCam';
import { sunVector } from './solar';

const lens = defaultLens(), level = { yaw: 0, pitch: 0, roll: 0 };

describe('fisheye lens', () => {
  it('puts the zenith at the image centre and the horizon on the rim', () => {
    expect(projectDir(level, [0, 1, 0], lens).px[0]).toBeCloseTo(512, 3);
    const h = projectDir(level, [0, 0, -1], lens);
    expect(h.px[1]).toBeCloseTo(0, 3); // north is image-up
    expect(h.inside).toBe(true);
  });
  it('shows east on the left, as a real upward-looking camera does', () => {
    expect(projectDir(level, [1, 0.3, 0], lens).px[0]).toBeLessThan(512);
  });
  it('unproject inverts project', () => {
    const d = sunVector(130, 35), p = projectDir({ yaw: 0.3, pitch: 0.1, roll: -0.05 }, d, lens);
    const back = unprojectPx({ yaw: 0.3, pitch: 0.1, roll: -0.05 }, p.px, lens)!;
    back.forEach((v, i) => expect(v).toBeCloseTo(d[i], 5));
  });
  it('tilting the hull moves the sun in the image', () => {
    const d = sunVector(90, 50);
    const a = projectDir(level, d, lens).px, b = projectDir({ yaw: 0, pitch: 0, roll: 0.2 }, d, lens).px;
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(20);
  });
});

const sky = makeSky({ seed: 7, coverage: 0.5, windMs: [6, 2], latDeg: 33, lonDeg: 0 });
const gt = groundTruth(sky.clouds(30000), 0, 0, 1.5, level, lens);

describe('ground truth and segmentation', () => {
  it('finds clouds overhead at half coverage', () => { expect(gt.length).toBeGreaterThan(2); });
  it('a perfect segmenter scores perfectly', () => {
    const dets: Detection[] = gt.map((g) => ({ polygon: g.polygon, bbox: g.bbox, centroid: g.centroid, score: 1, sourceIds: [g.id], kind: 'cloud' }));
    const m = evaluateFrame(gt, dets, lens);
    expect(m.recall).toBe(1); expect(m.meanIou).toBeGreaterThan(0.99);
  });
  it('noise and dropout lower recall and IoU', () => {
    const clean = simulateSegmenter(gt, null, { ...defaultSeg(), boundaryNoisePx: 0, centerNoisePx: 0, dropRate: 0, mergeRate: 0, spuriousPerFrame: 0, glare: false }, lens, 1);
    const bad = simulateSegmenter(gt, null, { ...defaultSeg(), boundaryNoisePx: 25, centerNoisePx: 40, dropRate: 0.5, mergeRate: 0, spuriousPerFrame: 0, glare: false }, lens, 1);
    expect(evaluateFrame(gt, clean, lens).meanIou).toBeGreaterThan(evaluateFrame(gt, bad, lens).meanIou);
  });
  it('is reproducible for a seed, and the glare blob is a false positive', () => {
    const p = { ...defaultSeg(), glare: true };
    expect(simulateSegmenter(gt, [300, 300], p, lens, 5).length).toBe(simulateSegmenter(gt, [300, 300], p, lens, 5).length);
    expect(evaluateFrame(gt, simulateSegmenter(gt, [300, 300], p, lens, 5), lens).falsePositives).toBeGreaterThanOrEqual(1);
  });
});

describe('tracking', () => {
  it('keeps a stable id for a slowly moving detection and counts a switch when it jumps', () => {
    const det = (x: number): Detection => ({ polygon: [[x, 0], [x + 10, 0], [x + 10, 10]], bbox: [x, 0, x + 10, 10], centroid: [x, 5], score: 1, sourceIds: [4], kind: 'cloud' });
    const tr = new MaskTracker(40), log = new IdentityLog();
    let id = -1;
    for (const x of [100, 105, 110, 115]) {
      const d = det(x), m = tr.update([d], 1); log.add([d], m);
      if (id < 0) id = m.get(d)!.id; expect(m.get(d)!.id).toBe(id);
    }
    const jump = det(400), m = tr.update([jump], 1); log.add([jump], m);
    expect(m.get(jump)!.id).not.toBe(id);
    expect(log.switches).toBe(1);
  });
});

describe('export / import', () => {
  it('round-trips detections and rejects malformed input', () => {
    const e = buildExport(10, 'clouds', 'SAM 3.1', lens, level, [1, 2], gt);
    expect(e.groundTruth.length).toBe(gt.length);
    expect(parseDetections({ detections: [{ polygon: [[0, 0], [10, 0], [10, 10]], score: 0.8 }] })).toHaveLength(1);
    expect(() => parseDetections({ detections: [{ polygon: [[0, 0]] }] })).toThrow();
    expect(() => parseDetections({})).toThrow();
  });
});
