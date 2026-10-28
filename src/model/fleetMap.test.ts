import { fitFleet, mapPoint, worldPoint } from './fleetMap';

test('auto-fit includes every symbol and label after large drift and displacement',()=>{
 for(const nodes of [[{x:0,y:0}],[{x:-100,y:50},{x:9000,y:-4000}],[{x:10_000_000,y:30_000_000},{x:10_000_010,y:30_000_020}]]){
  const camera=fitFleet(nodes);
  for(const n of nodes){const [x,y]=mapPoint(camera,n.x,n.y);expect(x).toBeGreaterThanOrEqual(90);expect(x).toBeLessThanOrEqual(910);expect(y).toBeGreaterThanOrEqual(50);expect(y).toBeLessThanOrEqual(590);}
 }
});
test('drag conversion is reversible and the grid measures world meters at every zoom',()=>{
 const camera=fitFleet([{x:-50,y:-100},{x:4500,y:8000}]);
 const p=mapPoint(camera,300,700);const q=worldPoint(camera,...p);
 expect(q[0]).toBeCloseTo(300);expect(q[1]).toBeCloseTo(700);
 const a=mapPoint(camera,0,0),b=mapPoint(camera,camera.gridM,0);
 expect((b[0]-a[0])*camera.metersPerUnit).toBeCloseTo(camera.gridM);
});

test.each([[420,350],[1500,400],[800,600]])('fits symbols and labels in a responsive %d × %d map', (width,height)=>{
 const nodes=[{x:-500,y:-1000},{x:6000,y:2500},{x:0,y:0}];
 const camera=fitFleet(nodes,width,height);
 for(const n of nodes){const [x,y]=mapPoint(camera,n.x,n.y);expect(x).toBeGreaterThan(30);expect(x).toBeLessThan(width-30);expect(y).toBeGreaterThan(30);expect(y+43).toBeLessThan(height-10);}
});
