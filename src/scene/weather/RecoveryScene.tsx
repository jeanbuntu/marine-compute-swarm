import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { DoubleSide, Group, PlaneGeometry, Vector3 } from 'three';
import type { NodeDesign } from '../../model/parts';
import { evaluate, partPosition } from '../../model/hydrostatics';
import { recoveryHardware, recoveryPose } from '../../model/recovery';
import { NodeModel, Tube } from '../NodeModel';
export type RecoveryDetail = 'assembly' | 'cutaway' | 'mechanism';

function Water({ swell, progress }: { swell: number; progress: number }) {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(32,32,64,64); g.rotateX(-Math.PI/2); return g;
  },[]);
  useEffect(() => () => geometry.dispose(),[geometry]);
  useFrame(() => {
    const vertices = geometry.attributes.position;
    for(let i=0;i<vertices.count;i++) {
      const x=vertices.getX(i),z=vertices.getZ(i);
      vertices.setY(i, Math.sin(x*1.4+progress*5)*Math.cos(z*.8)*Math.min(.1,swell*.02));
    }
    vertices.needsUpdate=true; geometry.computeVertexNormals();
  });
  return <mesh geometry={geometry}><meshPhysicalMaterial color="#17364a" roughness={.55} metalness={.05} transparent opacity={.66} side={DoubleSide} depthWrite={false} /></mesh>;
}
function CameraSetup({ detail, design, progress, bagFailed }: { detail: RecoveryDetail; design: NodeDesign; progress: number; bagFailed: boolean }) {
  const { camera }=useThree();
  const controls=useRef<OrbitControlsImpl>(null);
  const last=useRef(new Vector3(0,.4,0));
  const mass=design.parts.reduce((v,p)=>v+p.massKg,0);
  const cg=design.parts.reduce((v,p)=>v+p.massKg*partPosition(design,p,'deployed')[1],0)/mass;
  const draft=evaluate(design,'deployed').draftM;
  useEffect(() => {
    camera.position.set(...(detail==='mechanism' ? [3.2,1.6,3.5] : detail==='cutaway' ? [3.8,2,4] : [5.2,3.3,5.2]) as [number,number,number]);
    last.current.set(0,.4,0); camera.lookAt(last.current);
  },[camera,detail]);
  useFrame(()=>{
    const pose=recoveryPose(progress), inflation=bagFailed?0:pose.inflation;
    const height=design.keelDepthM+design.hullDepthM + inflation*1.70;
    const local=new Vector3(inflation*.18,height/2-cg,0).applyAxisAngle(new Vector3(0,0,1),pose.roll);
    local.y+=cg-draft;
    if(controls.current){
      camera.position.add(local.clone().sub(last.current));
      controls.current.target.add(local.clone().sub(last.current)); controls.current.update();
    }
    last.current.copy(local);
  });
  return <OrbitControls ref={controls} makeDefault target={[0,.4,0]} minDistance={1.4} maxDistance={14} enablePan />;
}
function Body({ design, progress, detail, focus, callouts, bagFailed }: { design: NodeDesign; progress: number; detail: RecoveryDetail; focus: string | null; callouts: boolean; bagFailed: boolean }) {
  const ref=useRef<Group>(null), pose=recoveryPose(progress), deck=design.keelDepthM+design.hullDepthM;
  const mass=design.parts.reduce((v,p)=>v+p.massKg,0);
  const cg=design.parts.reduce((v,p)=>v+p.massKg*partPosition(design,p,'deployed')[1],0)/mass;
  const draft=evaluate(design,'deployed').draftM;
  const bag=recoveryHardware(design);
  useFrame(() => { if(ref.current) { ref.current.rotation.z=pose.roll; ref.current.position.y=cg-draft; } });
  return <group ref={ref}>
    <group position={[0,-cg,0]}>
      <NodeModel design={design} petals="deployed" ghostShell={detail!=='assembly'} hidePetals={detail==='mechanism'} highlightId={focus} recoveryInflation={bagFailed?0:pose.inflation} recoveryHatch={pose.hatch} />
      {callouts && <>
        <mesh position={[0,cg,0]}><sphereGeometry args={[.035,12,8]} /><meshBasicMaterial color="#f6cf85" depthTest={false} /></mesh>
        {detail!=='mechanism' && <Html position={[-.12,cg,-.12]} center distanceFactor={4}><span className="r-callout">LOW CENTRE OF MASS</span></Html>}
        {!bagFailed && pose.inflation>.05 && <><Html position={[bag.bagCenter[0]+.3,bag.bagCenter[1],0]} center distanceFactor={4}><span className="r-callout r-bag-label">OFFSET BUOYANCY<br />{(bag.bagVolumeM3*pose.inflation**3*1000).toFixed(0)} L geometric volume</span></Html><Tube a={[bag.bagCenter[0],bag.bagCenter[1]-.2,0]} b={[bag.bagCenter[0],bag.bagCenter[1]+.3,0]} radius={.012} color="#d8e6c4" /></>}
        {detail!=='assembly' && <Html position={[.85,deck-.35,0]} center distanceFactor={4}><span className="r-callout">GAS → VALVE → BAG</span></Html>}
      </>}
    </group>
  </group>;
}
export function RecoveryScene({ design, progress, detail, focus, swell, callouts, bagFailed }: { design: NodeDesign; progress: number; detail: RecoveryDetail; focus: string | null; swell: number; callouts: boolean; bagFailed: boolean }) {
  return <Canvas dpr={[1,1.5]} camera={{position:[5.2,3.3,5.2],fov:42,near:.05,far:100}} gl={{antialias:true}}>
    <color attach="background" args={['#0b1630']} />
    <fog attach="fog" args={['#0b1630',14,38]} />
    <hemisphereLight args={['#dbe3ed','#1b2532',1.1]} />
    <directionalLight position={[3,7,4]} intensity={2.2} color="#fff1d6" />
    <directionalLight position={[-4,2,-3]} intensity={.8} color="#c8d3e0" />
    <Suspense fallback={null}>
      <Body design={design} progress={progress} detail={detail} focus={focus} callouts={callouts} bagFailed={bagFailed} />
      {detail==='assembly' && <Water swell={swell} progress={progress} />}
      <CameraSetup key={detail} detail={detail} design={design} progress={progress} bagFailed={bagFailed} />
    </Suspense>
  </Canvas>;
}
