import type { NodeDesign } from '../model/parts';
import { partEnvelope, pvAreaM2 } from '../model/nodeDesign';
import { GPU, petalGeometry } from '../model/hardware';

const mm = (v: number) => `${(v * 1000).toFixed(v < 0.2 ? 2 : 0)} mm`;
export function Dimensions({ design, selected, onSelect, onFocus }: { design: NodeDesign; selected: string | null; onSelect(id: string): void; onFocus?(): void }) {
  const pg = petalGeometry(design), p = design.parts.find(p => p.id === selected);
  return <section aria-label="Hardware dimensions">
    <h3>Dimensions · {design.role}</h3>
    <p className="dim small">1 scene unit = 1 metre. Dimensions are physical sizes; zoom changes only the camera.</p>
    <label className="small">Component <select aria-label="Dimension component" value={selected ?? 'hull-shell'} onChange={e => onSelect(e.target.value)}>
      {design.parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    {onFocus && <button style={{ marginTop: 8 }} onClick={onFocus}>Focus component</button>}
    {p && <><h3>{p.name}</h3><p>{partEnvelope(design, p).map(mm).join(' × ')}</p><p className="dim small">{p.id.startsWith('petal-') ? `Tip width × thickness × radial length. Root width ${mm(pg.innerWidth)}; gross face ${pg.area.toFixed(2)} m².` : p.id.startsWith('gpu-') ? 'Slot allowance × board height × board length. Board dimensions are NVIDIA nominal; thickness is an installation allowance.' : 'Local X × Y × Z envelope · EST'}</p><p className="small">{p.rationale}</p></>}
    <p className="small">Eight tapered petals · four paired drives<br />PV collecting area {pvAreaM2(design).toFixed(2)} m² (EST)<br />Flat span across opposite panel tips {((design.hullSideM + 2 * pg.length) / Math.cos(Math.PI / 8)).toFixed(2)} m across vertices</p>
    <p className="small">2 × {GPU.name} · 24 GB each · {GPU.powerW} W each<br />Board: 168.54 × 68.90 mm · slot allowance 20.32 mm</p>
    <a className="small" href={GPU.source} target="_blank" rel="noreferrer">NVIDIA mechanical drawing · Fig. 4</a>
    <p className="dim small">Enclosure, host, cooling and linkage are engineering estimates. Eight facets share four drives. Rounded tips and swept-volume clearance checks prevent panel contact in deployed motion; detailed linkage and folding still need mechanical validation.</p>
  </section>;
}
