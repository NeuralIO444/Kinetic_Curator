// node src/gl/exposureModel.selfcheck.mjs
// #1830 — the exposure model: stops are countable (an authored detent
// table), the gain translation is exact at rest, the JS ACES mirror
// matches the shader's constants, and the resolve binder's precedence
// keeps probes and goldens byte-identical — an explicit linear exposure
// wins, and stops 0 produces the identical uniform stream as no options
// at all (gain exactly 1, same shader → same pixels).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  EXPOSURE_STOPS,
  EXPOSURE_STOPS_MIN,
  EXPOSURE_STOPS_MAX,
  stopsToGain,
  gainToStops,
  snapExposureStops,
  formatExposureStops,
  ACES_NARKOWICZ,
  acesNarkowiczMirror,
  resolveCurveMirror,
} from './exposureModel.mjs';
import { RESOLVE_FS } from './resolveFs.mjs';
import { bindResolveProbe } from './resolveBind.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8');

let checks = 0;
const ok = (name, fn) => {
  fn();
  checks++;
  console.log(`  [ok] ${name}`);
};

ok('detent table: frozen half stops, −2…+2, resting at 0', () => {
  assert.ok(Object.isFrozen(EXPOSURE_STOPS));
  assert.deepEqual([...EXPOSURE_STOPS], [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2]);
  assert.equal(EXPOSURE_STOPS_MIN, -2);
  assert.equal(EXPOSURE_STOPS_MAX, 2);
  for (let i = 1; i < EXPOSURE_STOPS.length; i++)
    assert.equal(EXPOSURE_STOPS[i] - EXPOSURE_STOPS[i - 1], 0.5, 'uniform half-stop spacing');
});

ok('gain translation: exact at rest, powers of two on detents', () => {
  assert.equal(stopsToGain(0), 1, 'stops 0 → gain EXACTLY 1 (goldens byte-identical)');
  assert.equal(stopsToGain(1), 2);
  assert.equal(stopsToGain(-1), 0.5);
  assert.equal(stopsToGain(2), 4);
  assert.equal(stopsToGain(-2), 0.25);
  assert.equal(stopsToGain(0.5), Math.SQRT2);
});

ok('stops ↔ gain round-trips on every detent', () => {
  for (const s of EXPOSURE_STOPS) {
    assert.ok(Math.abs(gainToStops(stopsToGain(s)) - s) < 1e-12, `round-trip ${s}`);
    assert.equal(snapExposureStops(gainToStops(stopsToGain(s))), s, `snap round-trip ${s}`);
  }
  assert.equal(gainToStops(0), 0, 'no gain → resting readout, not -Infinity');
  assert.equal(gainToStops(NaN), 0);
});

ok('snap: clamps to the table, nearest detent, ties low, junk rests at 0', () => {
  assert.equal(snapExposureStops(99), 2);
  assert.equal(snapExposureStops(-99), -2);
  assert.equal(snapExposureStops(0.26), 0.5);
  assert.equal(snapExposureStops(0.24), 0);
  assert.equal(snapExposureStops(0.25), 0, 'tie lands on the LOWER detent (modeStops precedent)');
  assert.equal(snapExposureStops(-1.75), -2, 'tie at the negative side also lands low');
  assert.equal(snapExposureStops(NaN), 0);
  assert.equal(snapExposureStops(undefined), 0);
});

ok('readout: the stop value itself, signed, in EV', () => {
  assert.equal(formatExposureStops(0), '0 EV');
  assert.equal(formatExposureStops(1), '+1.0 EV');
  assert.equal(formatExposureStops(0.5), '+0.5 EV');
  assert.equal(formatExposureStops(-1.5), '−1.5 EV');
  assert.equal(formatExposureStops(2), '+2.0 EV');
});

ok('mirror constants agree with the shader source (resolveFs is the truth)', () => {
  const grab = (name) => {
    const m = RESOLVE_FS.match(new RegExp(`const float ${name} = ([0-9.]+);`));
    assert.ok(m, `shader declares const float ${name}`);
    return Number.parseFloat(m[1]);
  };
  assert.equal(ACES_NARKOWICZ.a, grab('a'));
  assert.equal(ACES_NARKOWICZ.b, grab('b'));
  assert.equal(ACES_NARKOWICZ.c, grab('c'));
  assert.equal(ACES_NARKOWICZ.d, grab('d'));
  assert.equal(ACES_NARKOWICZ.e, grab('e'));
});

ok('shader order: exposure is applied pre-curve in the resolve (never upstream)', () => {
  const mainAt = RESOLVE_FS.indexOf('void main()');
  const exposed = RESOLVE_FS.indexOf('unpre(s.rgb, s.a) * max(u_exposure, 0.0)', mainAt);
  const curved = RESOLVE_FS.indexOf('if (u_aces >= 0.5) c = acesNarkowicz(c);', mainAt);
  assert.ok(exposed >= 0 && curved > exposed, 'main(): exposure → ACES');
});

ok('mirror: black stays black, monotone, matches the closed form at 1', () => {
  assert.equal(acesNarkowiczMirror(0), 0);
  const { a, b, c, d, e } = ACES_NARKOWICZ;
  assert.ok(Math.abs(acesNarkowiczMirror(1) - (a + b) / (c + d + e)) < 1e-12);
  let prev = -1;
  for (const x of [0, 0.18, 0.5, 1, 2.5]) {
    const y = acesNarkowiczMirror(x);
    assert.ok(y > prev && y >= 0 && y <= 1, `strictly rising below saturation at ${x}`);
    prev = y;
  }
  assert.equal(acesNarkowiczMirror(64), 1, 'HDR highlights roll off into the clamp, never past it');
  // The curve stage at rest is the shipped #532 look: gain 1, then ACES.
  assert.deepEqual(resolveCurveMirror([0.5, 0.25, 2], 0), [
    acesNarkowiczMirror(0.5),
    acesNarkowiczMirror(0.25),
    acesNarkowiczMirror(2),
  ]);
  // +1 stop doubles the light INTO the same curve (rolloff, not a new filter).
  assert.deepEqual(resolveCurveMirror([0.5, 0.25, 2], 1), [
    acesNarkowiczMirror(1),
    acesNarkowiczMirror(0.5),
    acesNarkowiczMirror(4),
  ]);
});

// --- the binder: uniform-stream proofs --------------------------------------
const bindAll = (opts) => {
  const set = {};
  bindResolveProbe(
    {
      uniform1f: (loc, v) => {
        set[loc] = v;
      },
      uniform2f: (loc, x, y) => {
        set[loc] = [x, y];
      },
      uniform4f: (loc, x, y, z) => {
        set[loc] = [x, y, z];
      },
    },
    (n) => n,
    opts,
  );
  return set;
};

ok('binder: stops 0 is the IDENTICAL uniform stream as no options (byte-identity)', () => {
  assert.deepEqual(bindAll({ exposureStops: 0 }), bindAll({}));
  assert.deepEqual(bindAll({ exposureStops: 0 }), bindAll({ exposure: 1 }));
  assert.equal(bindAll({}).u_exposure, 1);
});

ok('binder: stops translate to gain; off-table values snap first', () => {
  assert.equal(bindAll({ exposureStops: 1 }).u_exposure, 2);
  assert.equal(bindAll({ exposureStops: -2 }).u_exposure, 0.25);
  assert.equal(bindAll({ exposureStops: 0.5 }).u_exposure, Math.SQRT2);
  assert.equal(bindAll({ exposureStops: 99 }).u_exposure, 4, 'clamped to the +2 detent');
  assert.equal(bindAll({ exposureStops: NaN }).u_exposure, 1, 'junk rests at gain 1');
});

ok('binder: an explicit linear exposure always wins over stops', () => {
  assert.equal(bindAll({ exposure: 3, exposureStops: 1 }).u_exposure, 3);
  assert.equal(bindAll({ exposure: 1, exposureStops: 2 }).u_exposure, 1);
  assert.equal(bindAll({ exposure: 0.25, exposureStops: 2 }).u_exposure, 0.25);
});

ok('wiring: the loop pushes stops into the one resolve bag, every frame', () => {
  const loop = read('./liveLoop.mjs');
  assert.match(
    loop,
    /setResolveOptions\(\{[^}]*exposureStops: st\.exposureStops \?\? 0/s,
    'liveLoop pushes st.exposureStops in the setResolveOptions bag (the fxaa/weave discipline)',
  );
});

ok('manifest: the suite is wired into selfcheck.manifest', () => {
  const manifest = readFileSync(join(here, '../../selfcheck.manifest'), 'utf8');
  assert.ok(manifest.includes('node src/gl/exposureModel.selfcheck.mjs'), 'manifest line present');
});

console.log(`exposureModel.selfcheck: ${checks} checks passed`);
