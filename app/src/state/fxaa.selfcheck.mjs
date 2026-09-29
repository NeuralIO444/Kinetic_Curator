// node src/state/fxaa.selfcheck.mjs
// #740: FXAA is a per-machine display preference — default ON, remembered in its
// own localStorage key, survives a refused/absent storage, and stays out of the
// project document.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGlobalSlice, readFxaa } from './slices/globalSlice.js';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
};

assert.equal(readFxaa(), true, 'default ON with nothing stored');

let state = {};
const set = (patch) => { state = { ...state, ...patch }; };
const slice = createGlobalSlice(set);
assert.equal(slice.fxaa, true, 'slice starts ON');
slice.setFxaa(false);
assert.equal(state.fxaa, false);
assert.equal(mem.get('kc:fxaa:v1'), '0', 'OFF is remembered');
assert.equal(readFxaa(), false, 'a fresh session reads OFF back');
slice.setFxaa(true);
assert.equal(readFxaa(), true);

globalThis.localStorage = { getItem() { throw new Error('nope'); }, setItem() { throw new Error('nope'); } };
assert.equal(readFxaa(), true, 'refused storage → ON');
slice.setFxaa(false);
assert.equal(state.fxaa, false, 'session value still applies when storage refuses the write');

const here = dirname(fileURLToPath(import.meta.url));
assert.ok(!/fxaa/i.test(readFileSync(join(here, 'projectDocument.js'), 'utf8')),
  'fxaa is a display pref — it must not enter the project document');

console.log('fxaa.selfcheck: OK');
