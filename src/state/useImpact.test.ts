import { renderHook, waitFor } from '@testing-library/react';
import { useImpact, annualize } from './useImpact';
import { defaultConfig } from '../model/config';
import { workerDesign, masterDesign } from '../model/nodeDesign';

const designs = { worker: workerDesign(), master: masterDesign() };

test('computes a comparison off the main flow and reports loading', async () => {
  const cfg = { ...defaultConfig(), nodes: 3 };
  const { result } = renderHook(() => useImpact(cfg, designs, 10));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.result).not.toBeNull(), { timeout: 8000 });
  expect(result.current.loading).toBe(false);
  expect(result.current.result!.swarm.energyKwh).toBeGreaterThan(0);
});

test('annualize multiplies a per-day impact by node count and 365', () => {
  const day = { energyKwh: 10, computeTflopH: 20, revenueUsd: 30, co2AvoidedKg: 40 };
  expect(annualize(day, 3, 1000)).toEqual({ energyKwh: 10 / 3 * 1000 * 365, computeTflopH: 20 / 3 * 1000 * 365, revenueUsd: 30 / 3 * 1000 * 365, co2AvoidedKg: 40 / 3 * 1000 * 365 });
});
