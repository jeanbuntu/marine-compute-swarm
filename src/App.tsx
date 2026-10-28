import { MasterApp } from './ui/master/MasterApp';
import { SwarmScene } from './scene/SwarmScene';
import { readView } from './scene/urlState';
import { hasWebGL } from './scene/webgl';
import { ExplodedPanel } from './ui/ExplodedPanel';
import { HeroPanel } from './ui/HeroPanel';
import { HoverCard } from './ui/HoverCard';
import { ImpactStrip } from './ui/ImpactStrip';
import { KnobDrawer } from './ui/KnobDrawer';
import { NodeCameraPanel } from './ui/NodeCameraPanel';
import './ui/styles.css';

export function App() {
  if (typeof window !== 'undefined' && readView(window.location.search) !== 'swarm') return <MasterApp />;
  const webgl = hasWebGL();
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b1630' }}>
      {webgl ? <SwarmScene /> : <p style={{ color: '#cfe6ff', padding: '200px 24px 24px' }}>The 3D view needs WebGL, which this browser does not provide.</p>}
      <HeroPanel />
      <ImpactStrip />
      <KnobDrawer />
      <ExplodedPanel />
      <HoverCard />
      {webgl && <NodeCameraPanel />}
    </div>
  );
}
