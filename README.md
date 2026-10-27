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

## Master node bench

Open `?view=master` (or the link on the first screen) for a view of the master node alone, simulated in much finer detail. Waves move the hull and the water, and the four petals tilt individually to track the sun, with the angle, rate and power gain over fixed petals shown live. Pin the sun anywhere, change the sea state, wind and current, and watch the thrusters, their jets and flow particles as the node holds station or moves. A fisheye sky camera, which sees the node's own petals and mast, comes with ground truth, a simulated segmenter, tracking scores, and frame export and detection import for running SAM offline.

Live at https://solar-swarm.vercel.app.

## The node

Every node has a sealed square hull with a keel pod, four hinged PV petals, a battery and compute pod low in the keel, a seawater heat exchanger, four fixed 45° corner thrusters that move the node in any direction without steering parts, GNSS, an IMU, a sky camera and a mesh radio.

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
