// node src/state/fxaa.selfcheck.mjs
// #740: FXAA is a per-machine display preference — default ON, remembered in its
// own localStorage key, survives a refused/absent storage, and stays out of the
// project document.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGlobalSlice, readFxaa, readWeave } from './slices/globalSlice.js';

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

// #741: gate weave is the same kind of pref, but default OFF.
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); } };
mem.clear();
assert.equal(readWeave(), false, 'weave defaults OFF');
{
  let st = {};
  const sl = createGlobalSlice((patch) => { st = { ...st, ...patch }; });
  assert.equal(sl.weave, false);
  sl.setWeave(true);
  assert.equal(st.weave, true);
  assert.equal(mem.get('kc:weave:v1'), '1');
  assert.equal(readWeave(), true, 'a fresh session reads ON back');
}
globalThis.localStorage = { getItem() { throw new Error('nope'); }, setItem() { throw new Error('nope'); } };
assert.equal(readWeave(), false, 'refused storage → OFF');

const here = dirname(fileURLToPath(import.meta.url));
assert.ok(!/fxaa|weave/i.test(readFileSync(join(here, 'projectDocument.js'), 'utf8')),
  'fxaa/weave are display prefs — they must not enter the project document');

console.log('fxaa.selfcheck: OK');
