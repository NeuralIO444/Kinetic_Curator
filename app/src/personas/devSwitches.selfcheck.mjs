// devSwitches.selfcheck.mjs — the in-app DEV switch for the opt-in persona features (Matt, 2026-11-19/20).
//
// What it proves:
//  A. every row defaults OFF (no flag set in a fresh process);
//  B. each row flips exactly its own console flag — on writes `true` (what the console types), off removes the key —
//     and the feature's own reader agrees; the console path and the row read the same state (no second copy);
//  C. the switch's whole footprint is the flags themselves: no other global appears, no storage is touched;
//  D. NEVER SAVED: serializeProject's sha256 and the store's data are identical with every row on and off, the store
//     is never notified; only the DEV panel imports the module, and neither it nor the module names the store, a
//     project, a take or storage — so a take recorded with a row on is a take recorded with the console flag on;
//  E. no forbidden name on the surface: the row labels and the panel's switch block name neither hidden seat;
//     the audible flag's name still lives only in its driver.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_SWITCHES, devSwitchOn, onDevSwitchChange, setDevSwitch } from './devSwitches.mjs';
import { bandOn } from './bandLive.js';
import { doctrineLayoutOn } from '../curator/doctrineLayoutLive.js';
import { audibleOn } from '../curator/beatSynthLive.js';
import { useStore } from '../state/store.js';
import { serializeProject } from '../state/projectDocument.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  ok ${name}`);
};

// the console flag each row stands for, and the feature's own reader
const FLAG = { band: '__KC_BAND', doctrineLayout: '__KC_DOCTRINE_LAYOUT', audible: '__KC_QUEEN_AUDIBLE' };
const READER = { band: bandOn, doctrineLayout: doctrineLayoutOn, audible: audibleOn };
// the globals before any row is touched: C measures the switch's footprint against this
const PRISTINE = new Set(Object.getOwnPropertyNames(globalThis));
const allOff = () => DEV_SWITCHES.forEach((s) => setDevSwitch(s.id, false));

ok('the rows are band, doctrine layout, audible beats — in that order, nothing else (the Wire is not a row)', () => {
  assert.deepEqual(
    DEV_SWITCHES.map((s) => [s.id, s.label]),
    [
      ['band', 'band'],
      ['doctrineLayout', 'doctrine layout'],
      ['audible', 'audible beats'],
    ],
  );
});

ok('A. every row defaults OFF: no flag in a fresh process, every reader off', () => {
  for (const s of DEV_SWITCHES) {
    assert.equal(Object.prototype.hasOwnProperty.call(globalThis, FLAG[s.id]), false, `${s.id}: flag unset`);
    assert.equal(devSwitchOn(s.id), false, `${s.id}: row off`);
    assert.equal(READER[s.id](), false, `${s.id}: feature off`);
  }
  assert.equal(devSwitchOn('wire'), false, 'an unknown row reads off');
  assert.equal(setDevSwitch('wire', true), false, 'an unknown row cannot be turned on');
  assert.equal(Object.prototype.hasOwnProperty.call(globalThis, '__KC_WIRE'), false, 'the Wire is untouched');
});

ok('B. each row flips exactly its own console flag; the feature reader and the row agree; off removes the key', () => {
  let heard = 0;
  const un = onDevSwitchChange(() => heard++);
  for (const s of DEV_SWITCHES) {
    assert.equal(setDevSwitch(s.id, true), true);
    assert.equal(globalThis[FLAG[s.id]], true, `${s.id}: the same value the console sets`);
    assert.equal(READER[s.id](), true, `${s.id}: the feature reads on`);
    for (const o of DEV_SWITCHES)
      if (o.id !== s.id) assert.equal(devSwitchOn(o.id), false, `${s.id} on leaves ${o.id} off`);
    assert.equal(setDevSwitch(s.id, false), false);
    assert.equal(Object.prototype.hasOwnProperty.call(globalThis, FLAG[s.id]), false, `${s.id}: off removes the flag`);
    assert.equal(READER[s.id](), false, `${s.id}: the feature reads off`);
    // the console path: the row reads what the console set, and the row turns it back off
    globalThis[FLAG[s.id]] = true;
    assert.equal(devSwitchOn(s.id), true, `${s.id}: the row reads the console's flag`);
    setDevSwitch(s.id, false);
    assert.equal(READER[s.id](), false);
    // only a strict true is on, as in the readers
    assert.equal(setDevSwitch(s.id, 1), false, `${s.id}: truthy is not on`);
  }
  assert.equal(heard, DEV_SWITCHES.length * 4, 'every flip notifies the panel once');
  un();
});

ok('C. the whole footprint is the flags: no other global, no storage read or write', () => {
  let touched = 0;
  const fake = new Proxy(
    {},
    {
      get() {
        touched++;
        return () => null;
      },
    },
  );
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const prev = globalThis.localStorage;
  globalThis.localStorage = fake;
  try {
    const before = new Set([...PRISTINE, 'localStorage']);
    assert.deepEqual(
      Object.getOwnPropertyNames(globalThis).filter((k) => !before.has(k)),
      [],
      'the rows flipped in B left nothing behind',
    );
    for (const s of DEV_SWITCHES) setDevSwitch(s.id, true);
    const added = Object.getOwnPropertyNames(globalThis).filter((k) => !before.has(k));
    assert.deepEqual(added.sort(), Object.values(FLAG).sort(), 'on adds exactly the three flags');
    allOff();
    const left = Object.getOwnPropertyNames(globalThis).filter((k) => !before.has(k));
    assert.deepEqual(left, [], 'off leaves nothing behind');
    assert.equal(touched, 0, 'storage is never touched');
  } finally {
    if (had) globalThis.localStorage = prev;
    else delete globalThis.localStorage;
  }
});

ok('D. never saved: serializeProject sha256 and the store data identical on and off; the store never hears it', () => {
  const sha = () => createHash('sha256').update(JSON.stringify(serializeProject(useStore.getState()))).digest('hex');
  const data = () => JSON.stringify(useStore.getState(), (k, v) => (typeof v === 'function' ? undefined : v));
  let storeHeard = 0;
  const un = useStore.subscribe(() => storeHeard++);
  const offSha = sha();
  const offData = data();
  for (const s of DEV_SWITCHES) setDevSwitch(s.id, true);
  assert.equal(sha(), offSha, 'serializeProject identical with every row on');
  assert.equal(data(), offData, 'the store data identical with every row on');
  allOff();
  assert.equal(sha(), offSha, 'and off again');
  assert.equal(storeHeard, 0, 'the store is never written');
  un();
});

ok('D. only the PERSONA TUNE panel imports the switch; neither names the store, a project, a take or storage', () => {
  const files = [];
  (function walk(d) {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      statSync(p).isDirectory() ? walk(p) : files.push(p);
    }
  })(SRC);
  const importers = files
    .map((p) => relative(SRC, p))
    .filter((r) => /\.(js|jsx|mjs)$/.test(r) && !r.endsWith('.selfcheck.mjs'))
    .filter((r) => /devSwitches(\.mjs)?['"]/.test(code(read(r))));
  assert.deepEqual(importers, ['panels/PersonaTunePanel.jsx']);
  const mod = code(read('personas/devSwitches.mjs'));
  assert.doesNotMatch(mod, /store|serialize|project|take|Recorder|Section|localStorage|sessionStorage|indexedDB/i);
  const panel = read('panels/PersonaTunePanel.jsx');
  const block = panel.slice(panel.indexOf('function DevSwitchRows'), panel.indexOf('export function PersonaTunePanel'));
  assert.ok(block.length > 100, 'the switch block is found');
  assert.doesNotMatch(code(block), /useStore|serialize|localStorage|sessionStorage/);
});

ok('E. no forbidden name on the surface; the audible flag name stays in its driver', () => {
  const banned = /queen|governor|tina|turner|bowie/i;
  for (const s of DEV_SWITCHES) assert.doesNotMatch(s.label, banned, s.label);
  const panel = read('panels/PersonaTunePanel.jsx');
  const block = panel.slice(panel.indexOf('function DevSwitchRows'), panel.indexOf('export function PersonaTunePanel'));
  assert.doesNotMatch(code(block), banned);
  // every string the block renders: the labels (from the module) and the on / off words
  const literals = [...code(block).matchAll(/'([^']*)'/g)].map((m) => m[1]);
  for (const l of literals) assert.doesNotMatch(l, banned, l);
  assert.doesNotMatch(code(read('personas/devSwitches.mjs')), banned, 'the module names no hidden seat in code');
  assert.ok(!code(read('personas/devSwitches.mjs')).includes('__KC_'), 'the module names no flag: each stays in its driver');
});

console.log(`[selfcheck] devSwitches OK — ${n} checks: off by default, one flag per row, footprint = the flags, never saved, no forbidden names`);
