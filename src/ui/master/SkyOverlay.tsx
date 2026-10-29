import { useEffect, useState } from 'react';
import { layoutRects, msim, useMaster } from '../../state/master';
import { pointInPolygon, polygonArea, unprojectPx, type Pt } from '../../model/master/skyCam';
import { useTick } from './controls';

const KIND_COLOR = { cloud: '#3df08a', merged: '#ffb347', glare: '#ff6b6b', spurious: '#ff6b6b' } as const;
const pts = (p: Pt[], k: number) => p.map((q) => `${(q[0] * k).toFixed(1)},${(q[1] * k).toFixed(1)}`).join(' ');

/** SVG layer over the fisheye rectangle: sky rings, compass, ground truth, masks, track ids and a pixel inspector. */
export function SkyOverlay() {
  useTick(250);
  const [win, setWin] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<Pt | null>(null);
  useEffect(() => {
    const root = document.querySelector('.mroot');
    if (!root) return;
    const measure = () => { const r = root.getBoundingClientRect(); setWin({ w: r.width, h: r.height }); };
    measure();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
    const observer = new ResizeObserver(measure); observer.observe(root);
    return () => observer.disconnect();
  }, []);
  const s = useMaster();
  const R = layoutRects(win.w, win.h, s.view, s.pip).fisheye;
  if (!R || !win.w || !win.h) return null;
  const a = s.analysis, lens = s.lens, k = R.w / lens.sizePx, half = R.w / 2;
  const tel = msim.telemetry;
  const small = R.w < 360;

  const toPx = (e: React.PointerEvent<SVGRectElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * lens.sizePx, ((e.clientY - r.top) / r.height) * lens.sizePx];
  };
  let inspect: string | null = null;
  if (hover && a) {
    const d = unprojectPx(tel.att, hover, lens);
    if (d) {
      const el = (Math.asin(d[1]) * 180) / Math.PI, az = ((Math.atan2(d[0], -d[2]) * 180) / Math.PI + 360) % 360;
      const hit = a.gt.filter((g) => pointInPolygon(hover[0], hover[1], g.polygon)).map((g) => `#${g.id} ${(g.opacity * 100).toFixed(0)}% opaque, base ${g.altM.toFixed(0)} m`);
      const det = a.dets.filter((x) => pointInPolygon(hover[0], hover[1], x.polygon)).map((x) => `${x.kind} ${x.score.toFixed(2)}`);
      inspect = `az ${az.toFixed(0)}°  el ${el.toFixed(0)}°  ·  truth: ${hit.join('; ') || 'clear'}  ·  mask: ${det.join('; ') || 'none'}`;
    }
  }
  const degPerPx = lens.fovDeg / lens.sizePx;

  return (
    <div style={{ position: 'absolute', left: R.x, top: R.y, width: R.w, height: R.h, pointerEvents: small ? 'none' : 'auto' }}>
      <svg viewBox={`0 0 ${R.w} ${R.h}`} width={R.w} height={R.h} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <circle cx={half} cy={half} r={half - 0.5} fill="none" stroke="rgba(160,200,255,0.35)" />
        {s.layers.compass && !small && <>
          {[30, 60].map((el) => <circle key={el} cx={half} cy={half} r={((90 - el) / (lens.fovDeg / 2)) * half} fill="none" stroke="rgba(255,255,255,0.12)" strokeDasharray="2 4" />)}
          <text x={half - 4} y={14} fontSize={12} fill="#cfe6ff">N</text><text x={half - 4} y={R.h - 5} fontSize={12} fill="#cfe6ff">S</text>
          <text x={5} y={half + 4} fontSize={12} fill="#cfe6ff">E</text><text x={R.w - 15} y={half + 4} fontSize={12} fill="#cfe6ff">W</text>
        </>}
        {a && s.layers.gt && a.gt.filter((g) => !g.coversZenith || g.areaPx < lens.sizePx * lens.sizePx * 0.9).map((g) => (
          <polygon key={`g${g.id}`} points={pts(g.polygon, k)} fill="none" stroke="#6fd0ff" strokeWidth={1} strokeDasharray="4 3" opacity={0.8} />
        ))}
        {a && s.layers.dets && a.dets.map((d, i) => (
          <polygon key={`d${i}`} points={pts(d.polygon, k)} fill={KIND_COLOR[d.kind]} fillOpacity={0.14} stroke={KIND_COLOR[d.kind]} strokeWidth={1.4} />
        ))}
        {a && s.layers.tracks && !small && a.dets.map((d, i) => {
          const t = a.tracks.get(d);
          if (!t || t.age < 3 || polygonArea(d.polygon) < lens.sizePx * lens.sizePx * 0.004) return null;
          const cx = d.centroid[0] * k, cy = d.centroid[1] * k, raw = [t.velPxS[0] * k * 40, t.velPxS[1] * k * 40], mag = Math.hypot(raw[0], raw[1]), cap = mag > 50 ? 50 / mag : 1, vx = t.age > 6 ? raw[0] * cap : 0, vy = t.age > 6 ? raw[1] * cap : 0;
          return (
            <g key={`t${i}`}>
              <line x1={cx} y1={cy} x2={cx + vx} y2={cy + vy} stroke="#fff" strokeWidth={1.2} />
              <text x={cx + 3} y={cy - 3} fontSize={11} fill="#fff" stroke="#000" strokeWidth={2.5} paintOrder="stroke">
                T{t.id}{d.kind !== 'cloud' ? ` ${d.kind}` : ''} · {(Math.hypot(...t.velPxS) * degPerPx).toFixed(2)}°/s
              </text>
            </g>
          );
        })}
        {a?.sunPx && s.layers.sun && <g>
          <circle cx={a.sunPx[0] * k} cy={a.sunPx[1] * k} r={9} fill="none" stroke="#ffe27a" strokeWidth={1.5} />
          <line x1={a.sunPx[0] * k - 14} x2={a.sunPx[0] * k + 14} y1={a.sunPx[1] * k} y2={a.sunPx[1] * k} stroke="#ffe27a" />
          <line y1={a.sunPx[1] * k - 14} y2={a.sunPx[1] * k + 14} x1={a.sunPx[0] * k} x2={a.sunPx[0] * k} stroke="#ffe27a" />
        </g>}
        {!small && <rect x={0} y={0} width={R.w} height={R.h} fill="transparent" onPointerMove={(e) => setHover(toPx(e))} onPointerLeave={() => setHover(null)} />}
      </svg>
      {inspect && <div className="minspect small">{inspect}</div>}
      <div className="mcamtag small">{small ? 'Sky camera' : `Sky camera · ${lens.fovDeg}° fisheye · tilt ${((Math.hypot(tel.att.roll, tel.att.pitch) * 180) / Math.PI).toFixed(1)}°`}</div>
    </div>
  );
}
