# Master node bench

A second view (`?view=master`) that simulates only the master node, in far more detail than the swarm view. It does not step the swarm, mount the swarm nodes or run the impact comparison.

## Why

The swarm view answers "is the concept worth building". This view answers "how must one node behave":

- What do clouds look like to the node's own camera, and how well can a segmentation model (SAM 3 / 3.1) find and track them?
- Can the petals track the sun without the thrusters, and how fast and how far must they move in a given sun and sea?
- What does it cost in thrust and power to hold position, or move, in a given current, wind and sea?

## Parts

Pure model, `src/model/master/` (all unit tested):

- `waves.ts`: one seeded sea (12 JONSWAP-shaped components, deep-water dispersion). The water mesh shader, hull physics and particles all use the same components.
- `solar.ts`: frames (Ry Rx Rz, matching three's `YXZ`), sun vector, beam/diffuse split, irradiance on a tilted plane, best-tilt search. Positive petal tilt raises the outer edge, as rendered; the normal then leans back over the hull, so a low eastern sun is tracked by raising the west petal.
- `hull.ts`: heave, roll and pitch as damped oscillators toward the quasi-static equilibrium of the surface under the hull footprint, plus static heel from off-centre petals and wind.
- `petals.ts`: tilt limits (tip clearance in the current sea, mechanical stops), static heel and its limiter, rate-limited actuators, strategies (fixed 20 degrees, flat, track).
- `thrust.ts`: thruster layout read from the design, minimum-effort allocation including yaw, actuator-disc power, current, wind and wave-drift forces.
- `masterSim.ts`: assembles the above with sensing delay and noise, a station-keeping controller, an optional yaw-assist search and a 60 s history for charts.
- `skyCam.ts`: equidistant fisheye projection, analytic ground truth, a simulated segmenter with realistic failure modes, a mask tracker, scoring (recall, precision, IoU, ID switches) and the export/import format for running a real model offline.

Scene, `src/scene/master/`: displaced wave surface (polar grid, GPU waves), sky dome, the node with live petals and thrust arrows, flow particles, camera rig, and one render driver that draws the 3D view and a fisheye sky camera built from a cube map taken at the camera's position on the deck.

UI, `src/ui/master/`: conditions drawer (sun, clouds, sea, wind and current, petal controller, propulsion), analysis tabs (Petals, Propulsion, Sky camera), fisheye overlay with an inspector.

## Estimated, not measured

- Sun beam/diffuse split, sea albedo 0.06, hull response constants (added mass, damping), wave-drift reflection factor, thruster duct size and efficiency.
- Ground truth for cumulus is a footprint disc, not a rendered mask.
- No shading between petals or from the mast on the petals. The mast and dish are visible in the fisheye image.
- The simulated segmenter is a stand-in. No SAM model runs in the page.

## Findings to keep

- Petals alone capture most of the available gain. Yaw toward the best heading adds about 1% or less, and the as-built radial thrusters cannot make yaw torque anyway.
- Wind on the freeboard, mast and raised petals dominates station-keeping force at moderate wind. The swarm model's cubic-speed thrust charge ignores it, and ignores the poor low-speed efficiency of small ducted thrusters.
- Fast chop demands faster petal motion than a large slow swell.
