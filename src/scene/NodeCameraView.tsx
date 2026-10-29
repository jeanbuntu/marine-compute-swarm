import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrthographicCamera, Vector3 } from 'three';
import { useStore } from '../state/store';
import { sim } from '../state/sim';
import { FOOTPRINT_M } from '../model/tracker';
import { cameraPanelRect } from '../ui/camPanel';

const _up = new Vector3(0, 0, -1); // north is up in the picture

/**
 * Takes over rendering to draw the main view, then the selected node's sky camera
 * (a flat all-sky projection, east to the right) into the picture-in-picture rectangle.
 */
export function NodeCameraView() {
  const cam = useMemo(() => {
    const c = new OrthographicCamera(-FOOTPRINT_M, FOOTPRINT_M, FOOTPRINT_M, -FOOTPRINT_M, 0.5, 6000);
    c.up.copy(_up);
    return c;
  }, []);

  useFrame(({ gl, scene, camera, size }) => {
    gl.setScissorTest(false);
    gl.setViewport(0, 0, size.width, size.height);
    gl.render(scene, camera);
    const id = useStore.getState().selectedNodeId;
    const n = id ? sim.swarm.nodes[Number(id.slice(1))] : null;
    if (!n) return;
    cam.position.set(n.pos[0], 1.6, -n.pos[1]);
    cam.lookAt(n.pos[0], 100, -n.pos[1]);
    cam.updateMatrixWorld();
    gl.setScissorTest(true);
    const CAM = cameraPanelRect(size.width,size.height);
    gl.setScissor(CAM.left, CAM.bottom, CAM.size, CAM.size);
    gl.setViewport(CAM.left, CAM.bottom, CAM.size, CAM.size);
    gl.clearDepth();
    gl.render(scene, cam);
    gl.setScissorTest(false);
  }, 1);
  return null;
}
