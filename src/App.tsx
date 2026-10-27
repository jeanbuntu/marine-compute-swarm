import { SwarmScene } from './scene/SwarmScene';
import { hasWebGL } from './scene/webgl';
import { ExplodedPanel } from './ui/ExplodedPanel';
import { HoverCard } from './ui/HoverCard';
import { NodeCameraPanel } from './ui/NodeCameraPanel';
import './ui/styles.css';

export function App() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b1630' }}>
      {hasWebGL() ? <SwarmScene /> : <p style={{ color: '#cfe6ff', padding: 24 }}>3D view needs WebGL, which this browser does not provide.</p>}
      <ExplodedPanel />
      <HoverCard />
      <NodeCameraPanel />
      <h1 style={{ position: 'absolute', top: 12, left: 16, margin: 0, color: '#fff', fontSize: 18, pointerEvents: 'none' }}>Solar Swarm</h1>
    </div>
  );
}
