import { z } from 'zod';

export const ScenarioConfig = z.object({
  seed: z.number().int().default(7),
  coverage: z.number().min(0).max(1).default(0.5),
  windEastMs: z.number().min(-30).max(30).default(6),
  windNorthMs: z.number().min(-30).max(30).default(2),
  currentEastMs: z.number().min(-2).max(2).default(0.1),
  currentNorthMs: z.number().min(-2).max(2).default(-0.05),
  latDeg: z.number().min(-90).max(90).default(33.7),
  lonDeg: z.number().min(-180).max(180).default(-118.5),
  nodes: z.number().int().min(1).max(100).default(19),
  spacingM: z.number().min(10).max(500).default(40),
  maxSpeedMs: z.number().min(0.1).max(3).default(0.4),
  trackerNoiseM: z.number().min(0).max(500).default(30),
  trackerDropRate: z.number().min(0).max(1).default(0.05),
  pricePerTflopHourUsd: z.number().min(0).max(10).default(0.008),
  gridKgCo2PerKwh: z.number().min(0).max(1.5).default(0.37),
  usableComputeShare: z.number().min(0).max(1).default(0.8),
});
export type ScenarioConfig = z.infer<typeof ScenarioConfig>;
export const defaultConfig = (): ScenarioConfig => ScenarioConfig.parse({});
