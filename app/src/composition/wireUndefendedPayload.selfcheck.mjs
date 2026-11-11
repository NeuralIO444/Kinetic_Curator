// node src/composition/wireUndefendedPayload.selfcheck.mjs
//
// #2098 — a payload-less emit is a clean no-op on every wired event.
// Personas and the Canon binder emit onto the bus; a malformed emit must not throw inside a handler
// (emit() catches it, logs `[eventBus] <event> <error>`, and the event is lost).
// Wires the bus to a RECORDING dispatch (not the store), emits `undefined` on every 'wire' event in the registry,
// and asserts nothing logged an error.
import assert from 'node:assert/strict';
import { emit, Events } from './eventBus.js';
import { EVENT_REGISTRY } from './eventRegistry.js';
import { wireEventBus } from './wireEventBus.js';

// the dispatch pipe coalesces on requestAnimationFrame; a microtask stands in for a frame in Node
globalThis.requestAnimationFrame = (fn) => {
  queueMicrotask(() => fn(0));
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

wireEventBus(() => {});

const wired = Object.keys(EVENT_REGISTRY).filter((k) => EVENT_REGISTRY[k].handler === 'wire');
assert.ok(wired.length > 100, 'the registry lists the wired events');

const logged = [];
const realError = console.error;
console.error = (...a) => logged.push(a.map(String).join(' '));
const failing = [];
try {
  for (const key of wired) {
    const ev = Events[key];
    assert.ok(ev, `Events.${key} exists`);
    logged.length = 0;
    emit(ev);
    if (logged.length) failing.push(key);
  }
} finally {
  console.error = realError;
}
assert.deepEqual(failing, [], `undefined payload logs an [eventBus] error on: ${failing.join(', ')}`);
console.log(`  [ok] an undefined payload is a no-op on all ${wired.length} wired events`);
console.log('wireUndefendedPayload.selfcheck: 1 checks passed');
