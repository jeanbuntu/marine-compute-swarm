import { useEffect, useState, type ReactNode } from 'react';

/** Re-renders the caller a few times a second so live readouts follow the simulation. */
export function useTick(ms = 250) {
  const [n, set] = useState(0);
  useEffect(() => { const h = setInterval(() => set((v) => v + 1), ms); return () => clearInterval(h); }, [ms]);
  return n;
}

export function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="msec">
      <summary>{title}</summary>
      <div className="msec-body">{children}</div>
    </details>
  );
}

export function Slider({ label, value, min, max, step = 1, unit = '', onChange, digits = 0 }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; digits?: number; onChange(v: number): void;
}) {
  return (
    <label className="mslider">
      <span className="row" style={{ justifyContent: 'space-between' }}><span>{label}</span><b>{value.toFixed(digits)}{unit}</b></span>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string; title?: string }[]; onChange(v: T): void; label?: string }) {
  return (
    <div className="mseg" role="group" aria-label={label}>
      {options.map((o) => <button key={String(o.v)} title={o.title} className={o.v === value ? 'on' : ''} aria-pressed={o.v === value} onClick={() => onChange(o.v)}>{o.label}</button>)}
    </div>
  );
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange(v: boolean): void }) {
  return <label className="mcheck"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'bad' | 'warn' }) {
  return (
    <div className="mstat">
      <div className="dim small">{label}</div>
      <div className={`big ${tone ?? ''}`}>{value}</div>
      {sub && <div className="dim small">{sub}</div>}
    </div>
  );
}

export interface Series { label: string; color: string; data: number[]; dash?: boolean }
/** A small time-series chart with a zero line; the x axis is the last stretch of simulated seconds. */
export function LineChart({ series, height = 84, unit = '', min, max }: { series: Series[]; height?: number; unit?: string; min?: number; max?: number }) {
  const W = 340;
  const all = series.flatMap((s) => s.data);
  let lo = min ?? Math.min(0, ...all), hi = max ?? Math.max(0, ...all);
  if (!(hi > lo)) { hi = lo + 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={series.map((s) => s.label).join(', ')} style={{ display: 'block', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
        {lo < 0 && hi > 0 && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.18)" />}
        {series.map((s) => {
          const n = s.data.length;
          if (n < 2) return null;
          return <polyline key={s.label} fill="none" stroke={s.color} strokeWidth={1.3} strokeDasharray={s.dash ? '4 3' : undefined}
            points={s.data.map((v, i) => `${(i / (n - 1)) * W},${y(v)}`).join(' ')} />;
        })}
        <text x={4} y={11} fontSize={9} fill="#9db4d3">{hi.toFixed(1)}{unit}</text>
        <text x={4} y={height - 3} fontSize={9} fill="#9db4d3">{lo.toFixed(1)}{unit}</text>
      </svg>
      <div className="row small dim" style={{ flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
        {series.map((s) => <span key={s.label}><span style={{ color: s.color }}>{s.dash ? '╌╌' : '━━'}</span> {s.label}</span>)}
      </div>
    </div>
  );
}

export const PETAL_COLORS: Record<string, string> = { E: '#ffc247', S: '#4fd1c5', W: '#ff7a90', N: '#9db4ff', SE: '#e9a16b', SW: '#61b7a8', NW: '#d08cc7', NE: '#a0c7e8' };
export const fmtW = (w: number) => (Math.abs(w) >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${w.toFixed(0)} W`);
export const deg = (r: number) => (r * 180) / Math.PI;
