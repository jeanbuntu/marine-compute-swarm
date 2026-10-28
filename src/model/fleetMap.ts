export interface MapCamera { x:number; y:number; metersPerUnit:number; gridM:number;width:number;height:number }
/** Always contains every node and leaves room for enlarged symbols and labels. */
export function fitFleet(nodes:{x:number;y:number}[],width=1000,height=680):MapCamera {
  if(!nodes.length)return {x:0,y:0,metersPerUnit:1,gridM:100,width,height};
  const xs=nodes.map(n=>n.x),ys=nodes.map(n=>n.y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const metersPerUnit=Math.max(.2,(maxX-minX)/Math.max(100,width-180),(maxY-minY)/Math.max(80,height-150));
  const raw=metersPerUnit*80, power=10**Math.floor(Math.log10(raw));
  const gridM=[1,2,5,10].map(v=>v*power).find(v=>v>=raw)??power*10;
  return {x:(minX+maxX)/2,y:(minY+maxY)/2,metersPerUnit,gridM,width,height};
}
export const mapPoint=(camera:MapCamera,x:number,y:number):[number,number]=>[camera.width/2+(x-camera.x)/camera.metersPerUnit,camera.height/2-20+(y-camera.y)/camera.metersPerUnit];
export const worldPoint=(camera:MapCamera,x:number,y:number):[number,number]=>[camera.x+(x-camera.width/2)*camera.metersPerUnit,camera.y+(y-camera.height/2+20)*camera.metersPerUnit];
