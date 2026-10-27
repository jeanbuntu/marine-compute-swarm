import { useRef } from 'react';
import { useMaster } from '../../state/master';
import { parseDetections } from '../../model/master/skyCam';
import { Check, Section, Seg, Slider, Stat, useTick } from './controls';

const pc = (v: number | undefined) => (v === undefined ? '–' : `${(v * 100).toFixed(0)}%`);

export function SkyTab({ onReset }: { onReset(): void }) {
  useTick();
  const s = useMaster();
  const a = s.analysis, file = useRef<HTMLInputElement>(null);
  const patchSeg = (p: Partial<typeof s.seg>) => s.set({ seg: { ...s.seg, ...p } });
  const toggle = (k: keyof typeof s.layers) => s.set({ layers: { ...s.layers, [k]: !s.layers[k] } });

  async function importFile(f: File | undefined) {
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const dets = parseDetections(json);
      if (!s.exportFrame) throw new Error('Export a frame first: detections are scored against that frame’s ground truth.');
      s.set({ imported: { dets, frame: s.exportFrame }, error: null });
      onReset();
    } catch (e) { s.set({ error: (e as Error).message }); }
  }

  return (
    <div className="mtab">
      <div className="mcards">
        <Stat label="Recall" value={pc(a?.avg?.recall)} sub={a?.metrics ? `${a.metrics.matched} of ${a.metrics.gt} clouds found` : undefined} />
        <Stat label="Precision" value={pc(a?.avg?.precision)} sub={a?.metrics ? `${a.metrics.det} masks` : undefined} />
        <Stat label="Mean IoU" value={a?.avg ? a.avg.meanIou.toFixed(2) : '–'} sub={a?.avg ? `centroid ${a.avg.centroidErrPx.toFixed(1)} px off` : undefined} />
        <Stat label="ID switches" value={`${a?.idSwitches ?? 0}`} sub={`${a?.frames ?? 0} frames`} tone={(a?.idSwitches ?? 0) > 5 ? 'warn' : undefined} />
      </div>
      <div className="dim small">
        Source: <b>{a?.source ?? '–'}</b>{a?.source === 'imported' && <> · <button onClick={() => { s.set({ imported: null }); onReset(); }}>Back to simulated</button></>}
        {a?.metrics && <> · merged masks {a.metrics.merged} · glare/spurious {a.metrics.falsePositives}</>}
      </div>
      {s.error && <div className="banner small">{s.error}</div>}

      <Section title="Lens">
        <Slider label="Field of view" value={s.lens.fovDeg} min={120} max={200} step={5} unit="°" onChange={(v) => s.set({ lens: { ...s.lens, fovDeg: v } })} />
        <Seg label="Frame size" value={s.lens.sizePx} options={[{ v: 512, label: '512' }, { v: 768, label: '768' }, { v: 1024, label: '1024' }]} onChange={(v) => s.set({ lens: { ...s.lens, sizePx: v } })} />
        <div className="dim small">Equidistant fisheye on the deck, looking up. Seen from below, east is on the left. The node's own petals and mast are in the picture, as they would be for the real camera. The hull's roll and pitch from the waves tilt the image.</div>
      </Section>

      <Section title="Overlay">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Check label="Ground truth" value={s.layers.gt} onChange={() => toggle('gt')} />
          <Check label="Masks" value={s.layers.dets} onChange={() => toggle('dets')} />
          <Check label="Tracks" value={s.layers.tracks} onChange={() => toggle('tracks')} />
          <Check label="Compass" value={s.layers.compass} onChange={() => toggle('compass')} />
          <Check label="Sun" value={s.layers.sun} onChange={() => toggle('sun')} />
        </div>
        <div className="dim small">Ground truth is each cloud's footprint disc projected through the lens: exact for flat decks, approximate for puffy cumulus.</div>
      </Section>

      <Section title="Simulated segmenter">
        <div className="dim small">Stand-in output with the failure modes that break tracking. Ignored while detections are imported.</div>
        <Slider label="Smallest cloud worth scoring" value={s.seg.minAreaPx} min={100} max={4000} step={100} unit=" px²" onChange={(v) => patchSeg({ minAreaPx: v })} />
        <Slider label="Edge roughness" value={s.seg.boundaryNoisePx} min={0} max={30} unit=" px" onChange={(v) => patchSeg({ boundaryNoisePx: v })} />
        <Slider label="Mask offset" value={s.seg.centerNoisePx} min={0} max={40} unit=" px" onChange={(v) => patchSeg({ centerNoisePx: v })} />
        <Slider label="Missed clouds" value={s.seg.dropRate * 100} min={0} max={80} unit="%" onChange={(v) => patchSeg({ dropRate: v / 100 })} />
        <Slider label="Neighbours merged" value={s.seg.mergeRate * 100} min={0} max={100} unit="%" onChange={(v) => patchSeg({ mergeRate: v / 100 })} />
        <Slider label="Spurious blobs per frame" value={s.seg.spuriousPerFrame} min={0} max={3} step={0.1} digits={1} onChange={(v) => patchSeg({ spuriousPerFrame: v })} />
        <Check label="Sun glare reads as a cloud" value={s.seg.glare} onChange={(v) => patchSeg({ glare: v })} />
      </Section>

      <Section title="Run real SAM offline">
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Seg label="Model" value={s.model} options={[{ v: 'SAM 3', label: 'SAM 3' }, { v: 'SAM 3.1', label: 'SAM 3.1' }]} onChange={(v) => s.set({ model: v })} />
          <input aria-label="Text prompt" value={s.prompt} onChange={(e) => s.set({ prompt: e.target.value })} style={{ width: 150 }} />
        </div>
        <ol className="small dim" style={{ paddingLeft: 18, margin: '6px 0' }}>
          <li>Pause, then <b>Export frame</b>: you get a PNG and a JSON with the ground truth, lens and prompt.</li>
          <li>Run your model on the PNG and write <code>{'{"detections":[{"polygon":[[x,y],…],"score":0.9}]}'}</code> in the PNG's pixel coordinates.</li>
          <li><b>Import detections</b>: they are drawn and scored against that frame's ground truth.</li>
        </ol>
        <div className="row">
          <button className="primary" onClick={() => s.set({ exportRequest: s.exportRequest + 1 })}>Export frame</button>
          <button onClick={() => file.current?.click()}>Import detections</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
        <div className="dim small" style={{ marginTop: 6 }}>No SAM model runs in this page. The code seam is <code>samTrackerPlaceholder()</code>, which still throws.</div>
      </Section>
    </div>
  );
}
