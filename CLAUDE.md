# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Solar Swarm is a locally served 3D simulation of floating, solar-powered compute nodes that track clouds and steer away from shade. It doubles as an investor demo and a hardware design tool. See `AGENTS.md` for status, known findings and next steps, and `docs/design/` and `docs/plans/` for the approved design and plan.

## Commands

```
npm install
npm run dev                               # http://127.0.0.1:5173
npm run build                             # tsc --noEmit && vite build
npm test                                  # vitest run (whole suite)
npx vitest run src/model/solver.test.ts   # single file
npx vitest run -t "test name"             # single test by name
npx tsc --noEmit                          # type check only
```

No linter is configured.

Master node bench: `?view=master` (see `AGENTS.md` and `docs/design/2026-10-27-master-node-view-design.md`). Deploy: `npx vercel@latest deploy --prod --yes`, live at https://solar-swarm.vercel.app.

## Rules that constrain changes

- Keep repo text, commit messages and docs about the product only. Do not mention how the project was started or which tools were used. Do not add attribution trailers to commits. (This file and the name `CLAUDE.md` are the one exception, by the owner's request.)
- The node must float and be stable. Every hardware edit goes through `applyEdit` in `src/model/solver.ts`. It must never apply an edit that breaks hydrostatic stability; it returns `ok`, `recommend` (other knobs to change) or `infeasible`. Do not bypass it.
- Do not tune the model to make results look better. The first screen reports the dodging-versus-holding comparison as the model computes it.
- Use TDD for `src/model/` changes. It is pure TypeScript with no DOM, and all randomness uses the seeded RNG in `rng.ts`, so tests are deterministic.

## Architecture

Three layers, dependencies pointing downward only:

1. **`src/model/`** (pure): `nodeDesign.ts` defines worker and master nodes as part lists (origin at keel bottom centre, y up; the master adds Starlink terminal and mast, second GNSS, battery and compute). `hydrostatics.ts` evaluates the worst of deployed and stowed against thresholds (reserve buoyancy ≥ 50%, GM ≥ 0.15 m, heel ≤ 10°, freeboard > 0). `solver.ts` gates edits. `sky.ts` is a wrapping 24 km domain of moving clouds with projected shadows. `swarm.ts` steps nodes from navigator commands (desired ground velocities; thrust power is cubic in speed) with battery state. `impact.ts` runs the scripted navigator and the hold-station baseline in identical weather to produce energy, compute, revenue and carbon, and `scaleUp`.
2. **`src/state/`**: zustand `store.ts`, the live `Sim` singleton in `sim.ts` (decides every 30 s, sub-steps up to 10 s), `editor.ts` (routes UI edits to the solver), `useImpact.ts` (debounced worker call). The impact comparison runs in `src/workers/impact.worker.ts` with an inline fallback.
3. **`src/scene/` and `src/ui/`**: React Three Fiber scene and HTML overlays.

Plug-in seams for planned work: `CloudTracker` in `tracker.ts` (`samTrackerPlaceholder()` throws until SAM 3.1 is connected) and `Navigator` in `navigator.ts` (`agentNavigatorStub` is where the agentic navigation harness attaches).

## Gotchas

- Hover ids are `nodeId` or `nodeId/partId`. Far node models are unmounted in `scene/lod.ts` because three's raycaster ignores `visible`; hidden models would otherwise swallow pointer events.
- The exploded node is lifted 1.8 m (`EXPLODED_LIFT_M` in `scene/Nodes.tsx`) so parts are not hidden by the ocean. The camera dive floor is 15 m (`scene/cameraLimits.ts`).
- The node camera view (`scene/NodeCameraView.tsx`) renders a picture-in-picture from a priority-1 `useFrame`, so it must not be given a lower priority. It is an orthographic all-sky projection (north up, east right).
- Cloud puffs are billboarded in a vertex-shader patch (`scene/Clouds.tsx`) so they face every camera, including the node camera.
- View state lives in the URL (`?cam=&target=&explode=`, see `scene/urlState.ts`). In dev, `window.__store` exposes the store for scripted checks.
- `src/setupTests.ts` mocks canvas `getContext` for jsdom; the scene cannot render in tests, so check visuals in a real browser.
- Default max speed is 0.4 m/s on purpose: at 1.5 m/s thrust consumed all PV output.
- Editing hull dimensions does not move other parts (known V1 simplification).
- Master view: `src/model/master/` is pure and tested; `msim` (`src/state/master.ts`) is stepped by `MasterDriver` at priority -1, and `MasterRender` is the only priority-1 `useFrame`, so it owns rendering. Do not add another. Petal angles are written to meshes each frame, not through React props.
- Master view axes: x east, y up, z south; sky north is -z. Petal tilt is positive when the outer edge rises. Attitude is Ry(yaw) Rx(pitch) Rz(roll), three's `YXZ`.
