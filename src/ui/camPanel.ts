/** Where the node camera picture sits on screen, in CSS pixels from the bottom-left corner. */
export const CAM = { left: 16, bottom: 16, size: 320 } as const;

/** Shared by WebGL and HTML so the picture fits narrow and landscape screens. */
export function cameraPanelRect(width:number,height:number) {
  return {...CAM,size:Math.max(80,Math.min(CAM.size,width-32,height-100))};
}
