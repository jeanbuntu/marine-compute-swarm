# Solar Swarm

**Data centers that follow the sun.** A swarm of floating, solar-powered compute nodes that watches the sky, dodges the clouds, and turns sunlight into compute across the planet.

## The idea

Each node floats on the ocean, carries its own solar array, and sells the compute it runs. Sunlight is the fuel, and clouds are the main thing standing between a node and its output. Because the nodes can move, they can respond: watch the sky, decide where the clouds are going, and shift out of their way. Solar Swarm is the simulation that shows how that works and what it is worth.

## Run it

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm test         # unit and interface tests
npm run build    # production build in dist/
```

Optional starting view from the address bar: `?cam=x,y,z&target=x,y,z&explode=n0`.

## What you see

- **First screen:** the swarm on a 3D ocean under a 3D cloud layer, with the value up front: energy harvested, compute delivered, revenue and carbon avoided for a daylight day, each compared with a swarm that only holds station. Scale buttons show the same numbers at 100, 1,000 and 10,000 nodes. The detailed controls live behind the **Controls** button.
- **Move around:** drag to orbit, Shift + left-drag (or right-drag) to pan, and scroll to zoom from the whole swarm down to one node, and dive below the surface (to 15 m) to see hulls, keels and thrusters from underneath.
- **Playback:** 1×, 2× and 5× allow slow inspection alongside the faster simulation speeds.
- **Hardware scale:** one scene unit is one meter. Black cell-pattern PV panels meet physical hinges and support struts. Battery packs, compute enclosures, heat exchanger, antennas and thrusters have distinct geometry and mounts. Inspection offers assembled and exploded views, equipment dimensions in millimeters, and a one-meter scale bar. Equipment envelopes and the exposed GPU modules are representative estimates, not manufacturer CAD; the assembled compute remains in its sealed enclosure.
- **Hover and click:** hovering a node or a petal highlights it. Clicking a node opens its exploded view: every subsystem fanned apart, each part with a mass, power, cost and a one-line reason for its placement, all editable.
- **Stays afloat:** every part has a mass and a position. Draft, freeboard, reserve buoyancy, metacentric height and wind heel are computed live, with petals deployed and stowed. An edit that would sink the node or tip it over is blocked, and the app recommends which other knobs to change so the value you want can work.
- **Sky camera:** selecting a node shows what its sky camera sees, with tracked clouds boxed and their motion drawn as arrows, plus the navigator's current decision and reason.

## Unit bench · master and worker

Open `?view=unit&role=master` or `?view=unit&role=worker` (or the link on the first screen) for a single unit simulated in much finer detail. The Master / Worker switch changes the actual equipment and simulation mass; `?view=master` remains a compatible master-only entry point. Use **Dimensions** to select any component and show its physical envelope in millimeters. **Focus component** pauses, opens the exploded assembly, and moves the camera to the selected item. **Explode / Assemble** works on either role. Conditions and Analysis are collapsible, with bottom panels in narrow windows. Waves move the hull and the water, and the eight petals tilt in four mechanically linked pairs to track the sun, with the angle, rate and power gain over fixed petals shown live. Pin the sun anywhere, change the sea state, wind and current, and watch the thrusters, their jets and flow particles as the node holds station or moves. A fisheye sky camera, which sees the node's own petals and mast, comes with ground truth, a simulated segmenter, tracking scores, and frame export and detection import for running SAM offline.

Live at https://solar-swarm.vercel.app.

## The node

Every node has a sealed square hull with a keel pod, eight tapered PV petals in four linked pairs, a battery and compute pod low in the keel, a seawater heat exchanger, four fixed 45° corner thrusters that move the node in any direction without steering parts, GNSS, an IMU, a sky camera and a mesh radio.

One **master node** near the center also carries the swarm's only Starlink terminal on a mast above the petals, a second GNSS, extra battery and the coordinator. Workers link to it over the mesh radio.

## Cloud tracking and navigation

Two interfaces, each with a working simulated version:

- `src/model/tracker.ts`: `CloudTracker`. A simulated tracker stands in today, with adjustable noise and dropouts. `samTrackerPlaceholder()` is the seam where SAM 3.1 plugs in.
- `src/model/navigator.ts`: `Navigator`. A scripted policy moves nodes cross-wind out of predicted shadows. `agentNavigatorStub()` is the seam for a model-driven navigation agent, which receives the tracked clouds, forecast, swarm state and limits, and returns movement commands.

## Honest numbers

Values marked EST are estimates without a direct source and should be confirmed before use. In the default scenario the scripted dodging gives only a small change in energy and slightly less compute than holding station, because thrust costs energy and clouds move faster than nodes can. That is what the model shows; improving it is the job of the navigation agent.

## Layout

```
src/model/    pure TypeScript: node parts, hydrostatics, stability solver, power, sky,
              tracker, navigator, swarm, impact
src/state/    store, live simulation, editor, impact hook
src/scene/    3D ocean, clouds, nodes, cameras
src/ui/       first screen, controls drawer, exploded view, sky camera panel
src/workers/  impact worker
docs/design/  design document
docs/plans/   implementation plan
```

## Hardware reference

Both views render the same eight-facet octagonal PV ring, radiused hull and equipment model at one scene unit per metre. Four adjacent pairs share geared drive concepts. Panel area uses the tapered shape and cell borders; panel mass and wind area use the full faces. The hull is 1.60 m wide with 80 mm corner radii, included in displacement and waterplane inertia.

Every unit carries two **NVIDIA L4 24 GB** cards. NVIDIA's [PB-11316-001 v01, Fig. 4](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/l4/PB-11316-001_v01.pdf) gives a nominal 168.54 mm board length and 68.90 mm board height, used directly in the geometry. The 20.32 mm thickness is a single-slot installation allowance, not a measured card thickness. Each card draws up to 72 W; host/cooling adds an estimated 136 W. The sealed host enclosure is derived from the cards plus estimated host, connector, cold-plate and service space. Batteries, cooling and stability also constrain the hull; a small GPU does not imply a small floating platform. The stock passive L4 requires system airflow; the sealed cooling integration still needs thermal validation.

Linkage and folding remain mechanical concepts. The unit bench reports estimated gravity-load actuator demand with 55% drive efficiency, plus 6 W overhead per moving drive; it gives no counterbalance credit. Swarm energy assumes 6 W average per paired drive (roughly 10% duty), totaling 24 W. These are different operating assumptions, not a claim that extra panel area has no actuation cost. Deployed panel motion now has a conservative frame-and-rail clearance interlock. Self-shading, folding mechanics and wind/wave torque on the drives are not validated.

Compute estimates count the two GPU cards only, using 121 dense FP16 Tensor TFLOPS per L4 from NVIDIA's [Ada whitepaper, Appendix D](https://images.nvidia.com/aem-dam/Solutions/geforce/ada/nvidia-ada-gpu-architecture.pdf). Host and coordinator power are overhead. Delivered utilization, linear throughput versus power, rental pricing and annualization remain scenario estimates rather than measured performance.

## Panel travel clearance

The eight petals no longer use outlines that tile only when flat. Their edges reserve the swept space needed for independent ±30° travel, with rounded 40 mm corner setbacks. Larger angles remain available up to the mechanical stop, but `petalClearance.ts` checks conservative convex prisms enclosing the frame, glass and underside rails for every pair of panels. Separating-axis checks and a vertex-displacement bound certify the entire swept move; the linked drives stop at a 12 mm operating clearance, with an 8 mm guaranteed swept-clearance floor. The analysis panel reports this interlock and PV output uses the actual stopped angles. This is a deployed panel-envelope check, not validation of the detailed gearbox, actuator or folding mechanism.

Collecting area includes the narrower outline, cell inset and rounded corner cutouts. Static swarm/inspection geometry uses the same outline. The simplified stowed stack uses 100 mm layer spacing to clear the rails; folding transitions are still not simulated.

### Weather Simulator

Open `?view=weather` (also linked from Swarm and Unit bench) for seven weather rehearsal tabs: Day, Night, Heavy winds, Storm, High swells, Tides and Current. Drag a node out of formation, inspect mesh relay reachability and battery balance, or inject capsize, wildlife impact, ingress, low battery and coordinator loss. Conditions are editable; switching tabs resets the fleet and conditions, while Reset fleet preserves edited conditions.

The page explores a proposed recovery policy: mesh retries, autonomous return to cached formation slots, compute shedding at 25% battery, propulsion reserve at 10%, and physical retrieval when inverted or unable to make headway. Wildlife hold idles fleet propulsion. The nominal 250 m radio radius and weather penalties are assumptions to test. Motion, illustrative wave roll and injected damage do not validate open-ocean survivability or self-righting. Read “Recovery & design rationale” on the page for hardware tradeoffs and unmodeled hazards.

### Recovery hardware concept and 3D close-ups

Workers and the master share an updated retained rub rail, guarded thrusters, captive panel locks, a packed gas-assisted righting bag, protected gas source, isolated recovery controller, leak sensor and candidate distress telemetry pod. Their estimated mass and overhead feed the existing hardware model; both defaults still pass the upright deployed/stowed checks.

Use **Weather Simulator → 3D recovery close-up**, or **Unit bench → Recovery close-up**, to inspect Assembly, Cutaway and Mechanism views. Scrub through knockdown, propulsion isolation, bag inflation, roll and verification; select individual components or enable the inflation-failure branch. The proposed offset bag avoids a permanent dome above the solar deck. It remains inflated after the replay and requires servicing.

This is a mechanism demonstration with prescribed poses, not proof of self-righting. Full-angle stability, wave-basin tests, compressed-gas sizing, bag deployment clearance, guard drag and inverted radio performance remain unresolved. Replay does not clear simulated fleet faults or authorize propulsion restart.


### Low-power and lost-link recovery drills

Weather Simulator now includes an explicit recovery coordinator. At 8% main battery it keeps navigation/mesh essentials alive and idles compute and propulsion; solar can recharge the node, with propulsion held until above 15%. A proposed separate GNSS + low-rate satellite modem can report position, battery and fault using an assumed 20 Wh reserve, including when main power fails. GPS determines position; the satellite modem transmits it independently of the master’s Starlink.

Simulated delivery assumes 60 s acquisition, 5-minute updates and 0.2 Wh per packet; these are test settings, not provider guarantees. Disable the satellite test channel or antenna sky view to rehearse failures. Inversion blocks delivery. The UI distinguishes current truth positions from received fixes and their age.

When conditions permit, at most three healthy connected workers (35% minimum charge) form a bounded relay chain toward the reported fix, retaining maneuver and battery margin. Unsafe drift, a stale or distant fix, lost coordination, wildlife, insufficient escorts or physical damage leads to retrieval instead. Escorts cannot tow or recharge a stranded node. There is no live satellite service, and a shore distress report does not restore compute backhaul.
