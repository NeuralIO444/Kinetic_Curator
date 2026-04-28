# Kinetic Curator Sketch

A starter Processing sketch for a native generative art engine inspired by Joshua Davis and the HYPE framework.

## Structure

- `KineticCuratorSketch/KineticCurator.pde` - main sketch and runtime control
- `KineticCuratorSketch/AssetPool.pde` - loads SVG assets from the `data` folder
- `KineticCuratorSketch/InputRouter.pde` - converts webcam brightness into a normalized stimulus value
- `KineticCuratorSketch/LayoutManager.pde` - arranges assets using a grid-style layout and stimulus-driven transforms

## Setup

1. Open Processing 4 on macOS.
2. Create a sketch named `KineticCuratorSketch` and add the files from this folder.
3. Place your SVG files into the `data` folder next to the sketch.
4. Install the HYPE library inside Processing.

## Controls

- Press `s` to save a high-resolution PDF snapshot of the current frame.

## Notes

- The sketch uses `P3D` for GPU acceleration.
- The `AssetPool` is designed to scan `data` for `.svg` assets and fall back to placeholder geometry if none are found.
- The `LayoutManager` is intentionally simple to make it easy to swap in more advanced HYPE-inspired layouts.

## Repository
This repository now includes the remote `NeuralIO444/Kinetic_Curator` history and the local KineticCurator prototype implementation.
