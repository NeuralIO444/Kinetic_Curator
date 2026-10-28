// node src/gl/parity/glDriver.selfcheck.mjs — #1578 GPU-mode slice:
// the launch-args bookkeeping behind costBench --gpu. Pure (no browser
// launch): pins the platform→ANGLE mapping and the set/freeze semantics;
// the frozen-after-launch throw needs a live browser and is covered by the
// guard's placement (setGlLaunchArgs is only ever called pre-launch by
// costBench), not by this suite.
import assert from 'node:assert';
import os from 'node:os';
import { realGpuLaunchArgs, setGlLaunchArgs, glLaunchArgs } from './glDriver.mjs';

// — platform mapping: ANGLE on the real GPU backend, null when unknown —
assert.deepEqual(realGpuLaunchArgs('darwin'), ['--use-gl=angle', '--use-angle=metal']);
assert.deepEqual(realGpuLaunchArgs('win32'), ['--use-gl=angle', '--use-angle=d3d11']);
assert.deepEqual(realGpuLaunchArgs('linux'), ['--use-gl=angle', '--use-angle=vulkan']);
assert.equal(realGpuLaunchArgs('freebsd'), null);
assert.equal(realGpuLaunchArgs('aix'), null);
// Default platform resolves through the same table.
assert.deepEqual(realGpuLaunchArgs(), realGpuLaunchArgs(os.platform()));

// — set/get semantics before any launch —
assert.equal(glLaunchArgs(), null); // stock launch is the default
const metal = ['--use-gl=angle', '--use-angle=metal'];
setGlLaunchArgs(metal);
assert.deepEqual(glLaunchArgs(), metal);
// The stored args are a copy: mutating the caller's array changes nothing.
metal.push('--caller-mutation');
assert.deepEqual(glLaunchArgs(), ['--use-gl=angle', '--use-angle=metal']);
// Empty / non-array input clears back to the stock launch.
setGlLaunchArgs([]);
assert.equal(glLaunchArgs(), null);
setGlLaunchArgs(['--use-gl=angle', '--use-angle=vulkan']);
assert.deepEqual(glLaunchArgs(), ['--use-gl=angle', '--use-angle=vulkan']);
setGlLaunchArgs(null);
assert.equal(glLaunchArgs(), null);

console.log('glDriver.selfcheck: launch-args mapping + set/get semantics ok');
