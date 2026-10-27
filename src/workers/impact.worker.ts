import { runScenario } from '../model/impact';
import type { ScenarioConfig } from '../model/config';
import type { Designs } from '../model/swarm';

export interface ImpactRequest { id: number; config: ScenarioConfig; designs: Designs; hours: number }

self.onmessage = (e: MessageEvent<ImpactRequest>) => {
  const { id, config, designs, hours } = e.data;
  self.postMessage({ id, result: runScenario(config, hours, 6, designs) });
};
