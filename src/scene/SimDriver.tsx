import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../state/store';
import { sim } from '../state/sim';

/** Advances the simulation each frame and mirrors the clock into the store a few times a second. */
export function SimDriver() {
  const config = useStore((s) => s.config);
  const sinceSync = useRef(0);

  useEffect(() => {
    sim.rebuild(config);
  }, [config]);

  useFrame((_, dt) => {
    const { playing, speed, setTime } = useStore.getState();
    if (playing) sim.step(Math.min(dt, 0.1) * speed);
    sinceSync.current += dt;
    if (sinceSync.current > 0.25) {
      sinceSync.current = 0;
      setTime(sim.timeS);
    }
  });
  return null;
}
