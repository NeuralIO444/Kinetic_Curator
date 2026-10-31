// node src/state/fxaa.selfcheck.mjs
// #740: FXAA is a per-machine display preference — default ON, remembered in its
// own localStorage key, survives a refused/absent storage, and stays out of the
// project document.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGlobalSlice, readExposureStops, readFxaa, readWeave } from './slices/globalSlice.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
};

assert.equal(readFxaa(), true, 'default ON with nothing stored');

let state = {};
const set = (patch) => {
  state = { ...state, ...patch };
};
const slice = createGlobalSlice(set);
assert.equal(slice.fxaa, true, 'slice starts ON');
slice.setFxaa(false);
assert.equal(state.fxaa, false);
assert.equal(mem.get('kc:fxaa:v1'), '0', 'OFF is remembered');
assert.equal(readFxaa(), false, 'a fresh session reads OFF back');
slice.setFxaa(true);
assert.equal(readFxaa(), true);

globalThis.localStorage = {
  getItem() {
    throw new Error('nope');
  },
  setItem() {
    throw new Error('nope');
  },
};
assert.equal(readFxaa(), true, 'refused storage → ON');
slice.setFxaa(false);
assert.equal(state.fxaa, false, 'session value still applies when storage refuses the write');

// #741: gate weave is the same kind of pref, but default OFF.
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
};
mem.clear();
assert.equal(readWeave(), false, 'weave defaults OFF');
{
  let st = {};
  const sl = createGlobalSlice((patch) => {
    st = { ...st, ...patch };
  });
  assert.equal(sl.weave, false);
  sl.setWeave(true);
  assert.equal(st.weave, true);
  assert.equal(mem.get('kc:weave:v1'), '1');
  assert.equal(readWeave(), true, 'a fresh session reads ON back');
}
globalThis.localStorage = {
  getItem() {
    throw new Error('nope');
  },
  setItem() {
    throw new Error('nope');
  },
};
assert.equal(readWeave(), false, 'refused storage → OFF');

// #1830: resolve exposure in stops is the same kind of pref — default 0 EV,
// remembered in its own key, snapped to the exposure model's detent table.
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
};
mem.clear();
assert.equal(readExposureStops(), 0, 'exposure defaults to 0 EV with nothing stored');
{
  let st = {};
  const sl = createGlobalSlice((patch) => {
    st = { ...st, ...patch };
  });
  assert.equal(sl.exposureStops, 0, 'slice starts at rest');
  sl.setExposureStops(1.5);
  assert.equal(st.exposureStops, 1.5);
  assert.equal(mem.get('kc:exposure:v1'), '1.5', 'the detent is remembered');
  assert.equal(readExposureStops(), 1.5, 'a fresh session reads it back');
  sl.setExposureStops(0.3);
  assert.equal(st.exposureStops, 0.5, 'off-detent writes snap to the table');
  sl.setExposureStops(99);
  assert.equal(st.exposureStops, 2, 'writes clamp to the table edge');
}
globalThis.localStorage = {
  getItem() {
    throw new Error('nope');
  },
  setItem() {
    throw new Error('nope');
  },
};
assert.equal(readExposureStops(), 0, 'refused storage → 0 EV');

const here = dirname(fileURLToPath(import.meta.url));
assert.ok(
  !/fxaa|weave|exposureStops/i.test(readFileSync(join(here, 'projectDocument.js'), 'utf8')),
  'fxaa/weave/exposureStops are display prefs — they must not enter the project document',
);

console.log('fxaa.selfcheck: OK');
