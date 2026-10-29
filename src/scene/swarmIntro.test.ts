import { PerspectiveCamera, Vector3 } from 'three';
import { hexSlots } from '../model/swarm';
import { frameSwarmNodes, swarmIntro } from './swarmIntro';

test.each([16/9,2,.58,.4])('isometric entry fits the master and two real workers at aspect %s',aspect=>{
 const view=swarmIntro(aspect);
 const camera=new PerspectiveCamera(50,aspect,.1,300000);
 camera.position.fromArray(view.position);camera.lookAt(new Vector3(...view.target));camera.updateMatrixWorld();camera.updateProjectionMatrix();
 for(const [x,y] of hexSlots(3,40))for(const dx of [-4,4])for(const dy of [-3,3])for(const dz of [-4,4]){
  const projected=new Vector3(x+dx,dy,-y+dz).project(camera);
  expect(Math.abs(projected.x)).toBeLessThan(.95);expect(Math.abs(projected.y)).toBeLessThan(.95);
 }
 const offsets=view.position.map((v,i)=>v-view.target[i]);
 expect(offsets[0]).toBeCloseTo(offsets[1]);expect(offsets[1]).toBeCloseTo(offsets[2]);
});
test('live preview framing follows its real node positions and handles a single node',()=>{
 const a=frameSwarmNodes([[0,0],[40,0],[0,40]]);
 const b=frameSwarmNodes([[100,50],[140,50],[100,90]]);
 expect(b.target[0]-a.target[0]).toBeCloseTo(100);expect(b.target[2]-a.target[2]).toBeCloseTo(50);
 expect(swarmIntro(.5,40,1).position.every(Number.isFinite)).toBe(true);
});
