import { useEffect, useRef, useState } from 'react';
import { runScenario, scaleUp, type Comparison, type Impact } from '../model/impact';
import type { ScenarioConfig } from '../model/config';
import type { Designs } from '../model/swarm';

const DEBOUNCE_MS = 350;
const DAYS_PER_YEAR = 365;

/** Per-year impact if `nodes` nodes ran this scenario's daylight day every day (EST, same weather daily). */
export function annualize(day: Impact, simulatedNodes: number, nodes: number): Impact {
  const perNode = { energyKwh: day.energyKwh / simulatedNodes, computeTflopH: day.computeTflopH / simulatedNodes, revenueUsd: day.revenueUsd / simulatedNodes, co2AvoidedKg: day.co2AvoidedKg / simulatedNodes };
  return scaleUp({ energyKwh: perNode.energyKwh * DAYS_PER_YEAR, computeTflopH: perNode.computeTflopH * DAYS_PER_YEAR, revenueUsd: perNode.revenueUsd * DAYS_PER_YEAR, co2AvoidedKg: perNode.co2AvoidedKg * DAYS_PER_YEAR }, nodes, []);
}

/** Runs the swarm-versus-hold comparison in a worker (inline where workers are unavailable), debounced. */
export function useImpact(config: ScenarioConfig, designs: Designs, hours = 12) {
  const [state, setState] = useState<{ result: Comparison | null; loading: boolean }>({ result: null, loading: true });
  const seq = useRef(0);
  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      if (typeof Worker !== 'undefined') {
        if (!worker.current) {
          worker.current = new Worker(new URL('../workers/impact.worker.ts', import.meta.url), { type: 'module' });
        }
        const w = worker.current;
        w.onmessage = (e: MessageEvent<{ id: number; result: Comparison }>) => {
          if (e.data.id === seq.current) setState({ result: e.data.result, loading: false });
        };
        w.postMessage({ id, config, designs, hours });
      } else {
        const result = runScenario(config, hours, 6, designs);
        if (id === seq.current) setState({ result, loading: false });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [config, designs, hours]);

  useEffect(() => () => worker.current?.terminate(), []);
  return state;
}
