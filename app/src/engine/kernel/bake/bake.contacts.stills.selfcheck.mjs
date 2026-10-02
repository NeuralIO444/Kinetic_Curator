// #814 — contacts on the bake path: bake the state or refuse the still.
//
// Law (from #167): studio video / stills bake contact offsets or refuse.
// Contacts are live-only (JS `_contactPass` in particles.js; the wasm
// module has no contact solver), so the contract is:
//
//   - "bake the state": a contact-active config bakes on the JS integrator,
//     bit-for-bit with the live ticks (pinned in
//     bake.contacts.selfcheck.mjs);
//   - "or refuse the still": the wasm fast path refuses contact-active
//     configs (reason 'contacts'); forcing engine:'wasm' on one throws
//     honestly instead of rendering a contact-less flock.
//
// The golden placement hash ignores contact offsets (pinned in
// src/engine/contacts.selfcheck.mjs §14: buildPlacements is identical
// with contact params set).
//
// Why no refuse on the in-app live stills / loop capture: those read the
// live integrator, which runs the same JS contact pass — the capture is
// what plays. Refusing an honest capture would be the dishonest act.
//
// "Contacts active" is contactRadius > 0 — the engine's own activation
// gate (particles.js skips the pass entirely at radius 0, leaving the
// swarm bit-identical to the pre-contact engine). A non-default mode /
// repel / restitution with radius 0 is inert and needs no refuse.
//
//   node src/engine/kernel/bake/bake.contacts.stills.selfcheck.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contactsBakePolicy, bakeParticles, bakeSwarmItems } from './index.js';
import { contactsActive, wasmBakeEligible } from './swarmWasm.mjs';
import { DEFAULT_LAYOUT_PARAMS, normalizeLayoutParams } from '../../../data/layout-modes.js';

const assets = [{ id: 'a' }, { id: 'b' }];
const palette = { swatches: ['#ff0000', '#00ff00', '#0000ff', '#ffff00'], bg: '#000' };
const seed = 0x814;
const count = 24;

function lp(extra = {}) {
  return normalizeLayoutParams({
    ...DEFAULT_LAYOUT_PARAMS,
    mode: 'swarm',
    particleCount: count,
    ...extra,
  });
}

function bakeOpts(layoutParams, engine) {
  return {
    seed, count, layoutParams, activeAssets: assets, palette,
    canvasW: 1000, canvasH: 700, steps: 4, engine,
  };
}

test('#814 detector: contactRadius > 0 is the activation signal', () => {
  assert.equal(contactsActive(lp()), false, 'defaults: no contacts');
  assert.equal(contactsActive(lp({ contactRadius: 18 })), true, 'radius alone activates');
  assert.equal(
    contactsActive(lp({ contactMode: 'bounce', contactRepel: 2, contactRestitution: 1 })),
    false,
    'non-default mode/repel with radius 0 is inert — no refuse needed',
  );
});

test('#814 policy: contact-active configs bake on JS, nothing else changes', () => {
  assert.deepEqual(contactsBakePolicy(lp()), { contacts: false, engine: 'auto' });
  assert.deepEqual(contactsBakePolicy(lp({ contactRadius: 18, contactMode: 'bounce' })), {
    contacts: true,
    engine: 'js',
    reason: 'contacts',
  });
});

test('#814 refuse: wasm fast path refuses contact-active configs', () => {
  const gate = wasmBakeEligible({ layoutParams: lp({ contactRadius: 18 }), count });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, 'contacts');
  assert.equal(wasmBakeEligible({ layoutParams: lp(), count }).ok, true);
});

test('#814 refuse: forced engine:"wasm" + contacts throws honestly', () => {
  assert.throws(
    () => bakeParticles(bakeOpts(lp({ contactRadius: 18, contactMode: 'bounce' }), 'wasm')),
    /cannot bake this config \(contacts\)/,
    'no silent contact-less flock',
  );
});

test('#814 bake: auto + contacts bakes on JS without refusing', () => {
  const items = bakeParticles(bakeOpts(lp({ contactRadius: 18, contactMode: 'bounce' }), 'auto'));
  assert.ok(Array.isArray(items) && items.length > 0, 'stills entry bakes contact state');
});

test('#814 bake: the stills entry (bakeSwarmItems) bakes contacts, never refuses', () => {
  const items = bakeSwarmItems({
    ...bakeOpts(lp({ contactRadius: 18, contactMode: 'swap' }), 'auto'),
    steps: 4,
  });
  assert.ok(Array.isArray(items) && items.length > 0);
  for (const it of items) {
    assert.ok(Number.isFinite(it.x) && Number.isFinite(it.y), 'baked item has finite placement');
  }
});
