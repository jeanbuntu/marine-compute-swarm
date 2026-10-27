# Solar Swarm

**Data centers that follow the sun.** A swarm of floating, solar-powered compute nodes that watches the sky, dodges the clouds, and turns sunlight into compute across the planet.

A swarm of solar-powered floating compute modules that sees the sky, tracks the clouds, and steers itself toward sunlight. Solar Swarm is the simulation that shows how that works and what it is worth.

## The idea

Each module floats on the ocean, carries its own solar array, and sells the compute it runs. Sunlight is the fuel, and clouds are the main thing standing between a module and its output. Because the modules can move, they can respond: watch the sky, decide where the clouds are going, and shift the swarm out of their way.

## What this project is for

Solar Swarm is built around the simulation. It aims to make four things easy to see:

- **The sky.** Rendered clouds and marine layer drifting across the swarm's operating area.
- **What a module sees.** A live view from any node's camera, with the clouds it is tracking marked in frame.
- **How the swarm responds.** Segmentation-based cloud tracking feeds a navigation decision, and the swarm moves away from shade and toward sun. You can watch the formation shift as it happens.
- **What it adds up to.** Energy harvested, compute delivered, and carbon offset, compared against a swarm that stays put.

## Cloud tracking

Cloud tracking is designed around SAM 3.1 for segmenting and following clouds frame to frame. The model is not wired in yet. A placeholder tracker sits behind the same interface, so the full pipeline of camera frame, cloud masks, motion estimate and navigation decision can be simulated end to end today and swapped over to the real model later.

## Simulation first, controls on demand

The first screen is the simulation and the value it produces. The detailed controls for hardware, environment, swarm behavior and economics are all there, but they stay out of sight until you ask for them.

## Status

Early. This repository starts with this README. The simulator is built up from here.
