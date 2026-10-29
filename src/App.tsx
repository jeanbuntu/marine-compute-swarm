import { HomePage } from './ui/HomePage';
import { SiteHeader } from './ui/SiteHeader';
import { lazy, Suspense } from 'react';
const WeatherApp = lazy(() => import('./ui/weather/WeatherApp').then(m=>({default:m.WeatherApp})));
const MasterApp = lazy(() => import('./ui/master/MasterApp').then(m=>({default:m.MasterApp})));
const SwarmPreviewPage = lazy(() => import('./scene/SwarmPreviewPage').then(m=>({default:m.SwarmPreviewPage})));
const SwarmScene = lazy(() => import('./scene/SwarmScene').then(m=>({default:m.SwarmScene})));
const Loading = () => <p className="loading-view" role="status">Loading simulation…</p>;
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
  if(typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('preview')==='swarm')return <Suspense fallback={<Loading />}><SwarmPreviewPage /></Suspense>;
  if (typeof window !== 'undefined' && readView(window.location.search) === 'home') return <HomePage />;
  if (typeof window !== 'undefined' && readView(window.location.search) === 'reasoning') return <Suspense fallback={<Loading />}><WeatherApp reasoning /></Suspense>;
  if (typeof window !== 'undefined' && readView(window.location.search) === 'weather') return <Suspense fallback={<Loading />}><WeatherApp /></Suspense>;
  if (typeof window !== 'undefined' && readView(window.location.search) !== 'swarm') return <Suspense fallback={<Loading />}><MasterApp /></Suspense>;
  const webgl = hasWebGL();
  return (
    <div data-swarm-viewport style={{ position: 'fixed', inset: 'var(--workspace-top) 0 0', background: '#0b1630' }}>
      <SiteHeader page="swarm" />
      {webgl ? <Suspense fallback={<Loading />}><SwarmScene /></Suspense> : <p style={{ color: '#cfe6ff', padding: '200px 24px 24px' }}>The 3D view needs WebGL, which this browser does not provide.</p>}
      <HeroPanel />
      <ImpactStrip />
      <KnobDrawer />
      <ExplodedPanel />
      <HoverCard />
      {webgl && <NodeCameraPanel />}
    </div>
  );
}
