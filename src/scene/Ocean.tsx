import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, MeshStandardMaterial, RepeatWrapping, Vector2 } from 'three';
import { waterNormalTexture } from './textures';

const SIZE = 160000;
const TILE_M = 24;

export function Ocean() {
  const mat = useMemo(() => {
    const normal = waterNormalTexture();
    normal.wrapS = normal.wrapT = RepeatWrapping;
    normal.repeat.set(SIZE / TILE_M, SIZE / TILE_M);
    return new MeshStandardMaterial({
      color: '#0a5f80', roughness: 0.22, metalness: 0.2, normalMap: normal, normalScale: new Vector2(0.7, 0.7), side: DoubleSide,
    });
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const n = mat.normalMap!;
    n.offset.set((t * 0.004) % 1, (t * 0.0025) % 1);
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={0}>
      <planeGeometry args={[SIZE, SIZE]} />
    </mesh>
  );
}
