# Solar Swarm V1 Implementation Plan

> **For implementers:** work task by task, in order. Steps use checkbox (`- [ ]`) syntax. Each task ends with a passing test run and a commit.

**Goal:** A locally served 3D simulation of a solar compute swarm: 3D ocean, clouds and nodes, a clickable exploded view with hydrostatics-gated editing, a node camera view, simulated cloud tracking and navigation behind replaceable interfaces, and a first screen that leads with impact.

**Architecture:** A pure TypeScript model (parts, hydrostatics, solver, power, sky, tracker, navigator, swarm, impact) with no DOM and unit tests, consumed by a Zustand store and a react-three-fiber scene. UI components read the store; the knob drawer edits the same scenario config the model uses.

**Tech Stack:** Vite, React 18, TypeScript, three, @react-three/fiber, @react-three/drei, zustand, zod, vitest, @testing-library/react.

**Spec:** `docs/design/2026-10-26-solar-swarm-v1-design.md`

## Global Constraints

- Runs with `npm install && npm run dev`; no backend, no network calls at runtime.
- Seawater density 1025 kg/m³; g = 9.81 m/s².
- Hydrostatic acceptance (applies to the default design and to every applied edit): reserve buoyancy >= 50% of mass, metacentric height GM >= 0.15 m, steady-wind heel <= 10°, each checked with petals deployed and stowed, and freeboard > 0.
- An edit that violates acceptance is never applied; the UI says it "would break hydrodynamic stability" and shows a recommendation.
- Every estimated value is labeled EST in the UI and carries a source or rationale string.
- First screen shows no knobs; all knobs live in a drawer that starts closed.
- All randomness comes from the seeded RNG in `src/model/rng.ts`; the seed is part of the scenario config.
- No file, commit message or doc may mention other internal projects or any AI tool or assistant. Commits carry no co-author or attribution trailers.

## Review Focus

1. An edit with zero, negative, NaN or out-of-range value (such as 0 kg battery or 1e6 kg ballast): rejected with a message, never a crash or a NaN readout. Tested in Task 4.
2. Petals stowed versus deployed give different stability results, and the worse of the two governs acceptance. Tested in Task 3.
3. Fully clear and fully overcast skies: no divide-by-zero, and the reported avoidance gain is honestly about zero. Tested in Task 9.
4. A swarm of 1 node (master only) and of 100 nodes: both step without error, and 100 nodes steps a tick in under 50 ms. Tested in Task 8.
5. Camera is clamped at the maximum dive depth and WebGL being unavailable shows a message instead of a blank page. Tested in Tasks 11 and 14.

---

## File Structure

```
src/model/    rng.ts constants.ts parts.ts nodeDesign.ts hydrostatics.ts solver.ts
              power.ts sky.ts tracker.ts navigator.ts swarm.ts impact.ts config.ts
src/state/    store.ts editor.ts
src/scene/    SwarmScene.tsx Ocean.tsx Clouds.tsx NodeModel.tsx CameraRig.ts cameraLimits.ts
              NodeCameraView.tsx explode.ts
src/ui/       HeroPanel.tsx ImpactStrip.tsx KnobDrawer.tsx ExplodedPanel.tsx PartEditor.tsx
              NodeCameraPanel.tsx knobDefs.ts
src/App.tsx   src/main.tsx   index.html
```

Tests sit next to each file as `*.test.ts(x)`.

### Task 1: Scaffold

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.gitignore` (node_modules, dist); Test `src/App.test.tsx`.

**Interfaces:** Produces `npm run dev`, `npm test` (vitest, jsdom), `npm run build`.

- [ ] **Step 1:** Write `App.test.tsx`: renders `<App/>` and expects text "Solar Swarm" in the document.
- [ ] **Step 2:** Run `npx vitest run` and see it fail (no App).
- [ ] **Step 3:** Scaffold Vite React TypeScript with the dependencies listed above; `App` renders a heading "Solar Swarm".
- [ ] **Step 4:** Run `npx vitest run` (pass) and `npm run build` (succeeds).
- [ ] **Step 5:** Commit `chore: scaffold app`.

### Task 2: Parts and node designs

**Files:** Create `src/model/constants.ts` (`RHO_SEA=1025`, `G=9.81`), `src/model/rng.ts` (`mulberry32(seed:number):()=>number`), `src/model/parts.ts`, `src/model/nodeDesign.ts`; Test `src/model/nodeDesign.test.ts`.

**Interfaces:** Produces
```ts
type Subsystem = 'hull'|'petals'|'power'|'compute'|'cooling'|'propulsion'|'navigation'|'comms'|'camera';
interface Part { id:string; name:string; subsystem:Subsystem; massKg:number; pos:[number,number,number]; size:[number,number,number]; powerW:number; costUsd:number; rationale:string; est:boolean }
interface NodeDesign { role:'worker'|'master'; hullSideM:number; hullDepthM:number; keelDepthM:number; petalLengthM:number; petalCount:number; parts:Part[] }
function workerDesign():NodeDesign; function masterDesign():NodeDesign;
function partMassKg(d:NodeDesign):number; function pvAreaM2(d:NodeDesign):number;
```
Position convention: origin at the keel bottom center, y up, meters.

- [ ] **Step 1:** Write tests: worker has parts in every subsystem listed in the spec's section 4 (hull, 4 petals, battery, compute pod, heat exchanger, MPPT/bus, 4 thrusters, GNSS, IMU, sky camera, mesh radio); the master additionally has a Starlink terminal at the deck center plus a second GNSS and extra battery; workers have no Starlink part; every part has a non-empty `rationale`; `pvAreaM2(workerDesign())` is within 7.5 to 10.5 m².
- [ ] **Step 2:** Run to see them fail.
- [ ] **Step 3:** Implement the designs from spec section 4: 1.52 m square hull, keel pod below it, battery and compute pod in the keel (low), thrusters at the four corners angled 45° (store the angle in the part's rationale and size), Starlink on a mast above petal shadow, petals hinged on each side. Choose part masses so the total lands near 500-600 kg; Task 3 finalizes the values.
- [ ] **Step 4:** Run tests, expect pass.
- [ ] **Step 5:** Commit `feat: node parts and designs`.

### Task 3: Hydrostatics

**Files:** Create `src/model/hydrostatics.ts`; Test `src/model/hydrostatics.test.ts`.

**Interfaces:** Consumes `NodeDesign`, constants. Produces
```ts
type PetalState='deployed'|'stowed';
interface HydroResult { massKg:number; draftM:number; freeboardM:number; reservePct:number; gmM:number; heelDeg:number; ok:boolean; violations:('sinks'|'reserve'|'stability'|'heel'|'freeboard')[] }
function evaluate(d:NodeDesign, petals:PetalState, windMs?:number):HydroResult;
function evaluateWorst(d:NodeDesign, windMs?:number):HydroResult; // worse of deployed and stowed
```
Method: hull and keel pod as boxes; draft from mass over waterplane area; KB and BM = I/V for the hull waterplane; KG from mass-weighted part positions; GM = KB + BM - KG; reserve = (rho x watertight volume - mass)/mass; heel from the wind pressure moment on deployed petals over righting moment. Deployed petals move their parts' positions outward, so recompute KG and wind area.

- [ ] **Step 1:** Tests: `evaluateWorst(workerDesign())` and master `ok` with `reservePct >= 0.5`, `gmM >= 0.15`, `heelDeg <= 10`; adding a 2000 kg part gives `ok:false` with `'sinks'` or `'reserve'`; moving the battery to deck height (y near the top) lowers GM and flips `ok` to false with `'stability'`; deployed and stowed results differ in `gmM`; a design with `massKg` NaN or negative returns `ok:false` without NaN fields.
- [ ] **Step 2:** Run, fail.
- [ ] **Step 3:** Implement `evaluate` and `evaluateWorst` as above. Return finite numbers always (clamp, then flag).
- [ ] **Step 4:** If the default designs do not pass, adjust `nodeDesign.ts` masses and positions (battery and compute low, mast and petals high) until they do; do not relax the constraints.
- [ ] **Step 5:** Run tests, expect pass. Commit `feat: hydrostatic evaluation`.

### Task 4: Constraint solver and recommendations

**Files:** Create `src/model/solver.ts`; Test `src/model/solver.test.ts`.

**Interfaces:** Consumes `NodeDesign`, `evaluateWorst`. Produces
```ts
type Knob='batteryKg'|'computeKg'|'ballastKg'|'hullDepthM'|'keelDepthM'|'petalLengthM'|'hullSideM';
type Edit={ knob:Knob; value:number } | { partId:string; field:'massKg'|'posY'; value:number };
type Outcome =
 | { status:'ok'; design:NodeDesign }
 | { status:'recommend'; message:string; changes:Edit[]; design:NodeDesign }
 | { status:'infeasible'; message:string; closest?:Edit; design:NodeDesign };
function applyEdit(d:NodeDesign, e:Edit):Outcome;
```
`recommend` returns the requested edit plus the smallest set of other knob changes (minimal normalized change, at most 3 knobs) that makes `evaluateWorst(...).ok` true; `design` is the result of applying all `changes`. `infeasible` returns the closest feasible value for the edited knob. Non-finite or out-of-range input is `infeasible` with a message.

- [ ] **Step 1:** Tests: a small safe edit gives `ok`; setting battery to 900 kg gives `recommend` whose `changes` include the requested edit, and `evaluateWorst(outcome.design).ok` is true; a 1e6 kg ballast gives `infeasible` with a `closest`; NaN, negative and Infinity values give `infeasible` and a message containing "stability" or "invalid"; the input design object is never mutated.
- [ ] **Step 2:** Run, fail.
- [ ] **Step 3:** Implement the search as a bounded greedy or grid search over the knob list; per-knob min/max live in a table in this file.
- [ ] **Step 4:** Run tests, expect pass. Commit `feat: stability-gated edits with recommendations`.

### Task 5: Power model

**Files:** Create `src/model/power.ts`; Test `src/model/power.test.ts`.

**Interfaces:** Produces
```ts
function pvPowerW(d:NodeDesign, ghiWm2:number, shadowFactor:number /*0..1 transmitted*/):number;
function loadW(d:NodeDesign, thrustW:number):number;
function stepBattery(socWh:number, capacityWh:number, netW:number, dtS:number):number; // clamped 0..capacity
```
PV = area x efficiency (0.21, EST) x ghi x shadowFactor x 0.97.

- [ ] **Step 1:** Tests: zero ghi gives 0 W; shadowFactor 0.2 gives about 20% of unshadowed; default worker clear-noon `pvPowerW` between 1.2 and 2.2 kW; `stepBattery` never leaves 0..capacity; `loadW` of the master exceeds a worker's.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement. **Step 4:** Run, pass. **Step 5:** Commit `feat: power model`.

### Task 6: Sky: sun and 3D cloud field

**Files:** Create `src/model/sky.ts`; Test `src/model/sky.test.ts`.

**Interfaces:** Produces
```ts
interface SkyConfig { seed:number; coverage:number /*0..1*/; windMs:[number,number]; latDeg:number; lonDeg:number }
interface Cloud { id:number; x:number; y:number; altM:number; radiusM:number; thicknessM:number; opacity:number }
interface Sky { clouds(t:number):Cloud[]; shadowFactor(t:number,x:number,y:number):number; sun(t:number):{ elevDeg:number; azDeg:number; ghiWm2:number } }
function makeSky(c:SkyConfig):Sky;
```
Cloud positions advect at `windMs`. Shadow is projected along the sun direction using cloud altitude. `coverage` 0 yields no clouds and 1 yields a full deck. Marine layer deck (low, wide, thin) plus cumulus cells.

- [ ] **Step 1:** Tests: same config gives identical clouds; `clouds(t+dt)` moves each cloud by `wind x dt`; coverage 0 gives `shadowFactor == 1` everywhere; coverage 1 gives `shadowFactor < 0.6` everywhere at midday; measured shadowed fraction over a sample grid is within 0.1 of `coverage` for 0.3 and 0.7; sun elevation is below 0 at local midnight and `ghiWm2` is 0 then.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement with seeded RNG. **Step 4:** Pass. **Step 5:** Commit `feat: sky and cloud model`.

### Task 7: Cloud tracker interface and simulated tracker

**Files:** Create `src/model/tracker.ts`; Test `src/model/tracker.test.ts`.

**Interfaces:** Consumes `Sky`. Produces
```ts
interface SkyFrame { t:number; nodeId:string; x:number; y:number; widthPx:number; heightPx:number }
interface TrackedCloud { id:number; bbox:[number,number,number,number]; centroidM:[number,number]; velocityMs:[number,number]; opacity:number; confidence:number }
interface CloudTracker { track(frame:SkyFrame):TrackedCloud[] }
function simulatedTracker(sky:Sky, opts:{ noiseM:number; dropRate:number; seed:number }):CloudTracker;
function samTrackerPlaceholder():CloudTracker; // documented seam for SAM 3.1; throws "SAM 3.1 not connected"
```

- [ ] **Step 1:** Tests: ids stay stable across consecutive frames; estimated velocity direction matches wind within 15°; `noiseM:0, dropRate:0` returns every cloud within the camera footprint; `dropRate:1` returns none without error; the SAM placeholder throws the exact message.
- [ ] **Step 2-5:** fail, implement, pass, commit `feat: cloud tracker interface`.

### Task 8: Navigator interface and swarm dynamics

**Files:** Create `src/model/navigator.ts`, `src/model/swarm.ts`; Test both.

**Interfaces:** Consumes `Sky`, `CloudTracker`, power functions. Produces
```ts
interface Observation { t:number; nodes:NodeState[]; tracked:Record<string,TrackedCloud[]>; slots:Vec2[]; limits:{ maxSpeedMs:number } }
interface Command { nodeId:string; velocityMs:[number,number]; reason:string }
interface Navigator { decide(o:Observation):Command[] }
function scriptedNavigator():Navigator;  // move out of predicted shadow, return to slot when clear
function agentNavigatorStub():Navigator; // seam for the model-driven harness; returns hold commands with reason 'agent not connected'
interface NodeState { id:string; role:'worker'|'master'; pos:Vec2; vel:Vec2; socWh:number }
interface Swarm { nodes:NodeState[] }
function makeSwarm(n:number, spacingM:number):Swarm;       // node 0 is the master, near the center, hex lattice
function stepSwarm(s:Swarm, cmds:Command[], dtS:number, env:{ sky:Sky; currentMs:[number,number] }):{ swarm:Swarm; thrustW:Record<string,number> };
```
Propulsion electric power = 0.5 x 1025 x Cd x A x v³ / eta (Cd 1.0, A 0.35 m², eta 0.4, all EST); speed is capped by `limits.maxSpeedMs`.

- [ ] **Step 1:** Tests: thrust power at 2v is 8x at v; a node under a tracked cloud with a clear direction ahead gets a velocity pointing out of the shadow; speed never exceeds the cap; `makeSwarm(1,...)` is a lone master and steps without error; `makeSwarm(100,...)` steps in under 50 ms; the stub returns one hold command per node.
- [ ] **Step 2-5:** fail, implement, pass, commit `feat: navigation interface and swarm dynamics`.

### Task 9: Impact model

**Files:** Create `src/model/impact.ts`; Test `src/model/impact.test.ts`.

**Interfaces:** Produces
```ts
interface Impact { energyKwh:number; computeTflopH:number; revenueUsd:number; co2AvoidedKg:number }
interface Comparison { swarm:Impact; stayPut:Impact; gainPct:number }
function runScenario(c:ScenarioConfig, hours:number):Comparison;
function scaleUp(perNode:Impact, nodes:number, regions:string[]):Impact;
```
Constants (EST, labeled in code with source note): grid factor 0.37 kg CO2/kWh, compute 1.7 TFLOPS/W, price per TFLOP-hour from config. `gainPct` is 0 when `stayPut.energyKwh` is 0.

- [ ] **Step 1:** Tests: clear sky (coverage 0) gives `|gainPct| < 1`; overcast (coverage 1) runs without NaN; with coverage 0.5 the swarm is never below stay-put by more than 1% (propulsion cost can eat gains and the result must show it honestly); `scaleUp(x, 10, [])` equals 10x `x`; the same config and seed gives identical numbers.
- [ ] **Step 2-5:** fail, implement, pass, commit `feat: impact comparison`.

### Task 10: Scenario config and store

**Files:** Create `src/model/config.ts` (zod `ScenarioConfig` with seed, coverage, wind, node count, trackerNoise, price, design edits), `src/state/store.ts`, `src/ui/knobDefs.ts`; Test `src/state/store.test.ts`.

**Interfaces:** Produces `useStore` with `config`, `setConfig(patch)`, `design` (worker and master), `applyDesignEdit(e:Edit):Outcome`, `selectedNodeId`, `hoveredId`, `explodedNodeId`, `drawerOpen:false`, `playing`, `timeS`. `knobDefs` lists every knob with label, unit, range, group and source.

- [ ] **Step 1:** Tests: default config parses; invalid config (coverage 2) is rejected; `drawerOpen` defaults to false; `applyDesignEdit` with an unstable edit leaves `design` unchanged and stores the recommendation in `lastOutcome`.
- [ ] **Step 2-5:** fail, implement, pass, commit `feat: scenario config and store`.

### Task 11: 3D scene: ocean, clouds, nodes, camera

**Files:** Create `src/scene/{SwarmScene.tsx,Ocean.tsx,Clouds.tsx,NodeModel.tsx,CameraRig.ts,cameraLimits.ts}`; Test `src/scene/cameraLimits.test.ts`.

**Interfaces:** Produces `clampCamera(pos:[number,number,number]):[number,number,number]` (y >= -15 m, distance within 2 m to 40 km), `isUnderwater(y:number):boolean`, and a `<SwarmScene/>` that reads the store.

Scene requirements: animated ocean surface; clouds from `sky.clouds(t)` rendered as volumetric or layered cloud sprites, credible from above, near water and from a node camera; cloud shadows on the water driven by `shadowFactor`; node models built from `Part`s so the 3D matches the data; below y=0 the scene gets blue-green fog and keel pods and thrusters are visible; level-of-detail makes nodes visible at swarm scale; orbit, pan and zoom controls through `drei`.

- [ ] **Step 1:** Write tests for `clampCamera` (clamps below -15 m, clamps distance range, passes through valid positions) and `isUnderwater`.
- [ ] **Step 2:** Run, fail. **Step 3:** Implement helpers, then the scene components. If WebGL is unavailable, `App` shows a message in place of the canvas (tested in Task 14).
- [ ] **Step 4:** Run tests, then `npm run dev` and look in a browser: ocean, clouds, shadows and nodes visible, orbit works, diving below the surface shows fog and the hull underside. Record any visual issue and fix before commit.
- [ ] **Step 5:** Commit `feat: 3D ocean, clouds and node scene`.

### Task 12: Hover, click, exploded view and part editor

**Files:** Create `src/scene/explode.ts`, `src/ui/ExplodedPanel.tsx`, `src/ui/PartEditor.tsx`, `src/state/editor.ts`; Test `src/scene/explode.test.ts`, `src/state/editor.test.ts`.

**Interfaces:** Produces `explodeOffsets(parts:Part[], factor:number):Record<string,[number,number,number]>` (offset radially from the node center, grouped by subsystem; factor 0 gives zero offsets) and `submitEdit(e:Edit)` in `editor.ts` returning `{ applied:boolean; message?:string; recommendation?:Edit[] }`, which also drives a Confirm button for recommendations (`acceptRecommendation()`).

Behavior: hovering a node or a part highlights it and shows its name, mass, power and rationale; clicking a node sets `explodedNodeId` and animates parts outward; the panel lists parts with editable mass and position, a live readout of draft, freeboard, reserve and GM; a rejected edit shows "This would break hydrodynamic stability" with the recommended changes and an "Apply all" button.

- [ ] **Step 1:** Tests: factor 0 gives zero offsets; offsets are distinct per subsystem group; `submitEdit` with a 1e6 kg value returns `applied:false` and a message containing "stability"; with a recommendable edit returns a `recommendation`, and `acceptRecommendation()` applies all changes with `evaluateWorst(...).ok` true; the design in the store is unchanged after a rejected edit.
- [ ] **Step 2-3:** fail, implement. **Step 4:** Run tests, then verify in the browser: hover highlights, click explodes, an unsafe edit is blocked with a recommendation. **Step 5:** Commit `feat: exploded view and gated editing`.

### Task 13: Node camera view

**Files:** Create `src/scene/NodeCameraView.tsx`, `src/ui/NodeCameraPanel.tsx`; Test `src/ui/NodeCameraPanel.test.tsx`.

**Interfaces:** Consumes `CloudTracker`, store. Renders the scene from the selected node's sky camera (wide-angle, render-to-texture) in a panel with an overlay of tracker bounding boxes, ids and velocity arrows; the panel text lists tracked cloud count and the navigator's latest command and reason.

- [ ] **Step 1:** Test: with the simulated tracker and a seeded sky, the panel shows one overlay box per tracked cloud and shows the command reason text; with no node selected it shows a prompt to select one.
- [ ] **Step 2-5:** fail, implement, pass, then verify in the browser that the view matches the sky above that node. Commit `feat: node camera view with tracking overlay`.

### Task 14: First screen: impact panel and hidden knobs

**Files:** Create `src/ui/HeroPanel.tsx`, `src/ui/ImpactStrip.tsx`, `src/ui/KnobDrawer.tsx`; Modify `src/App.tsx`; Test `src/ui/hero.test.tsx`.

**Interfaces:** Consumes `runScenario`, `scaleUp`, store, `knobDefs`.

Behavior: the first view is the scene plus an impact strip with energy, compute, revenue and carbon offset for the swarm against stay-put, a "scale to N nodes" control, and an assumptions link; the knob drawer opens from one small button and holds every knob from `knobDefs`, grouped; playback controls (play, pause, speed) sit with the scene. If WebGL is unavailable `App` shows a message in place of the canvas.

- [ ] **Step 1:** Tests: initial render has no slider elements visible and the drawer is closed; clicking the drawer button reveals knobs grouped by `knobDefs`; changing a knob updates the impact numbers; with WebGL absent (mock `getContext` to return null) a message is shown and the impact strip still renders; EST values show the "EST" label.
- [ ] **Step 2-5:** fail, implement, pass; verify in the browser that the first screen is clean. Commit `feat: impact-first screen with hidden knobs`.

### Task 15: Docs, final verification, publish

**Files:** Modify `README.md`.

- [ ] **Step 1:** Update the README with run instructions (`npm install`, `npm run dev`, `npm test`), what the app shows, and where the SAM 3.1 and agent seams are (`src/model/tracker.ts`, `src/model/navigator.ts`). Keep the tagline.
- [ ] **Step 2:** Run `npx vitest run`, `npx tsc --noEmit` and `npm run build`; all pass.
- [ ] **Step 3:** Scan the repo for forbidden mentions with `grep -ril` for other-project names and AI tool names (use the terms from Global Constraints); expect no output. Check `git log --format=%B` for trailers.
- [ ] **Step 4:** Walk the app in a browser against the spec's goals 1 to 8 and note any gap.
- [ ] **Step 5:** Commit `docs: usage and seams`; push only when asked.

---

## Self-review notes

- Spec coverage: goals 1 (T11), 2 (T12), 3 (T2), 4 (T3, T4), 5 (T13), 6 (T7, T8), 7 (T9, T14), 8 (T1, T14); non-goal and anti-goal guards in Global Constraints and T15; impact and carbon (T9); master versus worker (T2); failover is shown only, as decided in the spec's default, and is not a task.
- Types are consistent across tasks: `NodeDesign`, `Part`, `Edit`, `Outcome`, `Sky`, `TrackedCloud`, `Command`.
- Thresholds (reserve 50%, GM 0.15 m, heel 10°) are my calls; they are constants in `hydrostatics.ts` for easy change.
