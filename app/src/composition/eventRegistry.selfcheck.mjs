// The bus's map, kept honest: every event is in the registry, every claim about its handler is true, and an event
// nobody emits must say why (reserved / telemetry). Drift in either direction fails here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Events } from './eventBus.js';
import { EVENT_REGISTRY } from './eventRegistry.js';

const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(js|jsx|mjs)$/.test(f.name) && !/selfcheck/.test(f.name)) files.push(p);
  }
})('src');
const text = new Map(files.map((f) => [f.replace(/^src\//, ''), fs.readFileSync(f, 'utf8')]));
const own = (f) => f === 'composition/eventBus.js' || f === 'composition/eventRegistry.js';

const keys = Object.keys(Events);
const regKeys = Object.keys(EVENT_REGISTRY);
assert.deepEqual(
  keys.filter((k) => !(k in EVENT_REGISTRY)),
  [],
  'every bus event is in eventRegistry.js',
);
assert.deepEqual(
  regKeys.filter((k) => !(k in Events)),
  [],
  'every registry entry is a bus event',
);

const onRe = (k) => new RegExp(`\\b(?:on|once)\\(\\s*(?:ctx\\.)?Events\\.${k}\\b`);
const refRe = (k) => new RegExp(`Events\\.${k}\\b`);
let reserved = 0;
for (const k of keys) {
  const { handler, note } = EVENT_REGISTRY[k];
  if (handler === 'wire') {
    assert.ok(
      onRe(k).test(text.get('composition/wireEventBus.js')),
      `${k}: claimed wire, but wireEventBus does not handle it`,
    );
  } else if (Array.isArray(handler)) {
    for (const f of handler) assert.ok(onRe(k).test(text.get(f) || ''), `${k}: claimed handled in ${f}, it is not`);
  } else {
    assert.equal(handler, null, `${k}: handler is 'wire', a path list, or null`);
    assert.ok(note, `${k}: no handler needs a note (reserved or telemetry)`);
    assert.ok(
      !onRe(k).test(
        [...text.entries()]
          .filter(([f]) => !own(f))
          .map(([, t]) => t)
          .join('\n'),
      ),
      `${k}: has a handler, registry says none`,
    );
  }
  // an emitter is any file that references the event other than to listen to it (the bus and wire never emit)
  const emitted = [...text.entries()].some(
    ([f, t]) =>
      !own(f) &&
      f !== 'composition/wireEventBus.js' &&
      refRe(k).test(
        t
          .split('\n')
          .filter((l) => !onRe(k).test(l))
          .join('\n'),
      ),
  );
  if (!emitted) {
    reserved++;
    assert.ok(
      note && /reserved|telemetry/.test(note),
      `${k}: nobody emits it, and its note does not say reserved or telemetry`,
    );
  }
}
console.log(`eventRegistry.selfcheck: ok (${keys.length} events, ${reserved} reserved or telemetry)`);
