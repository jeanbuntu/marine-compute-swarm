# Marine Compute Swarm V1: Design

Date: 2026-10-26
Status: Draft for founder review

## 1. Intent

Marine Compute Swarm is a locally served 3D simulation of a swarm of solar-powered floating compute nodes. It exists to convince an investor, and to let the founder review and refine the hardware, that the concept is a realistic engineering product with real ROI and the potential to scale across the planet.

The 3D design is the evidence. An investor should see what a node looks like, what is inside it, why each part is where it is, how the swarm sees clouds and moves away from them, and what that is worth in energy, compute revenue and carbon offset.

This is a V1 proposal. The bar is completeness, not optimization: every subsystem a real unit needs is present, connected, visible and editable. Whether a given part is a better or worse choice than an alternative does not matter yet. A missing subsystem does.

## 2. Goals

1. A 3D scene with an ocean, a 3D cloud layer, and the swarm. The user can orbit, pan, zoom, and dive below the surface to a limited depth to see nodes from underneath.
2. Hovering a node or a petal highlights it. Clicking a node opens an exploded view of its parts, each hoverable and editable.
3. A realistic node design with named subsystems (section 4), each with mass, dimensions, power and cost, and a one-line rationale for its placement.
4. Hydrostatic feasibility enforced as a hard rule (section 5).
5. A per-node camera view showing what that node's sky camera sees, with tracked clouds marked.
6. Cloud tracking behind a SAM 3.1 placeholder, and navigation behind an agent interface (section 6). Both can be fully simulated now.
7. The first screen leads with the simulation and the value it produces (energy, compute delivered, revenue, carbon offset, versus a swarm that stays put). All detailed knobs exist but start hidden in a drawer.
8. Runs locally with `npm install && npm run dev`. No backend.

## 3. Non-goals and anti-goals

Non-goals: real SAM 3.1 inference; the real navigation agent; CFD or certified naval architecture; live weather data; multi-user features; a backend.

Anti-goals (a failure even if it technically works):
- A node design that would not float or would capsize, or an editor that lets the user create one.
- A first screen buried in sliders and tabs.
- Impact numbers that are inflated or unlabeled. Estimates are marked as estimates and carry a source where one exists. If cloud avoidance only gives a modest gain in a scenario, the simulation shows the modest gain.
- Any mention in the repository of how this project was started, of other internal projects, or of any AI tool as author or contributor. The README and docs describe the product only.

## 4. Node design (V1 engineering calls)

All values below are starting estimates (EST) for the model to compute from; the model is the source of truth, not this table. Every call is mine and open to change.

Common node (worker):
- **Hull:** square, about 1.5 m per side, a low sealed buoyant body with a keel pod below. Square hull so nodes tile into a hexagonal or grid formation and petals hinge off straight edges.
- **Petals:** four hinged petals, one per side, each carrying PV on its upper face and a hinge actuator. Deployed they span about 3.5 m tip to tip and tilt to follow the sun; stowed they fold up over the deck (wind, waves, storms). Together with deck PV the target is roughly 9 m² of PV (about 2 kW peak). The model computes the actual figure from the geometry.
- **Battery:** the heaviest single mass, mounted low in the keel pod to lower the center of gravity.
- **Compute pod:** sealed pod in the keel, cooled by a seawater heat exchanger through the hull. Mounted low, close to the water that cools it.
- **Power electronics:** MPPT charge controllers and a DC bus in the hull, with the battery management system next to the battery.
- **Propulsion:** four fixed thrusters at the hull corners, angled 45° in an X layout, so the node can move in any direction without turning and without moving parts for steering. Thrusters sit below the waterline.
- **Navigation and sensing:** GNSS antenna, IMU, and a sky-facing wide-angle camera on the deck for cloud tracking, plus a small status light.
- **Comms:** short-range radio mesh link to neighbors, antenna on a short mast on the deck.

Master compute node (one per swarm, placed near the formation center):
- Carries the **only Starlink terminal** (mast-mounted at the center of the deck, above petal shadow and spray, flat and fixed). Workers send data to the master over the mesh and the master uplinks for the whole swarm. I chose a shared uplink so terminal power and plan cost are paid once, not per node. The cost is bandwidth per node, which the model shows.
- Carries heavier compute, extra battery for the terminal's constant draw, a second GNSS for redundancy, and the swarm coordinator process that runs the navigation agent interface.
- If the master fails, the nearest healthy node takes over the role only if it is fitted for it (a V1 simplification: the model shows the failover but treats every node as master-capable in the spare-hardware sense; to be refined).

## 5. Hydrostatics (hard requirement)

Every component has a mass and a position. The model computes, continuously:
- total mass against displaced water at the chosen draft (seawater 1025 kg/m³), giving draft, freeboard and reserve buoyancy;
- center of gravity against center of buoyancy and the metacentric height, giving righting stiffness, for both petals-deployed and petals-stowed states, plus a simple heel check under the wind load on the deployed petals.

Nominal design must pass with a stated margin, not barely. Positions are chosen for stability (heavy parts low, light and tall parts high).

**Editor behavior:** an edit that would make the node sink, lack reserve buoyancy, or lose stability is not applied. The editor shows a clear message that the change would break hydrodynamic stability. It then recommends changes: a solver searches the other adjustable knobs (draft, hull depth, ballast, battery mass or position, petal length, compute pod mass and similar) for the smallest set of additional changes that makes the requested value feasible, and presents them as "To use this value, also change: ...", applied together with one click or declined. If no combination works, it says so and shows the closest feasible value.

## 6. Cloud tracking and agent navigation

Two replaceable interfaces, each with a working simulated implementation.

- **Tracker interface:** takes a node's camera frame and time; returns cloud masks with ids, motion vectors, and a short-term drift forecast. The placeholder is where SAM 3.1 plugs in. Until then, the simulated tracker derives its output from the simulation's true cloud field with configurable noise and latency, so the downstream pipeline behaves realistically.
- **Navigator interface (agent harness):** takes an observation (tracked clouds, forecast, swarm state, energy state, constraints) and returns movement commands. It is designed as a tool-style interface so a language-model agent can later reason over weather and drive it, specifically Meta's Muse model through a navigation harness the founder will build. V1 ships a scripted stand-in policy and a documented, typed interface plus a stub adapter for the agent. The scripted policy exists to make the simulation move; it is not the product.

The swarm moves under propulsion energy and current constraints, so moving away from a cloud has a real cost that the agent weighs against the sun it gains.

## 7. Simulation

- **Scene scale:** nodes are meters across and clouds are kilometers across. The view supports a continuous zoom from the whole operating area down to a single node, with level-of-detail so nodes stay legible at swarm scale.
- **Clouds:** a 3D cloud layer (a marine layer deck plus cumulus cells) advected by wind, with shadows cast onto the ocean from the sun direction. Node irradiance comes from whether its position lies in shadow. Rendering approach (volumetric versus layered billboards) is left to the builder, with a requirement that it looks credible from above, from a node's camera, and from near the water.
- **Ocean:** animated surface, with the camera allowed below it to a limited depth with underwater fog and the node hulls, keels and thrusters visible.
- **Node camera view:** a picture-in-picture or full panel that renders the scene from the selected node's sky camera and overlays the tracker's masks and motion arrows.
- **Swarm:** formation slots, station keeping, and cloud-avoiding moves, with the same energy, sunlight, compute and economics model for every node. The baseline for comparison is a swarm that stays put under the same weather.

## 8. Impact and economics (first screen)

Headline numbers, always comparing against the stay-put baseline over the same time: energy harvested, compute delivered, revenue, carbon offset, and what scaling to N nodes and several regions would yield. Carbon offset is computed as grid-equivalent emissions displaced by the solar-powered compute, using a labeled grid emissions factor (EST, with a source and date in the app). The assumptions behind each number are one click away.

## 9. Controls

The full set of knobs (hardware, environment, swarm, comms, economics, tracker noise, scenario seed) exists in a collapsed drawer. The first view shows none of them. All stochastic elements use a seeded RNG, so a scenario is reproducible.

## 10. Technology (my calls)

Vite, React, TypeScript; Three.js through react-three-fiber and drei for the scene; Zustand for state; Zod for the scenario config; Vitest for tests. The physical model (hydrostatics, power, swarm, economics, tracker and navigator interfaces) is pure TypeScript with no DOM, unit tested, and independent of the renderer. Heavy runs go in Web Workers.

## 11. Left to the builder

Exact geometry and part dimensions, the cloud rendering technique, the solver's search method, camera controls details, visual style, and the order of work (suggested first milestone: one node with a correct exploded view and a live hydrostatic check, since that anchors everything else).

## 12. Open items for the founder

- Whether failover of the master role should be modeled in V1 or just shown.
- The regions to use for the scale-up view.
