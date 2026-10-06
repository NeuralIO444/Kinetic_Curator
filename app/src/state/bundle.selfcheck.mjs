// bundle.selfcheck.mjs — the export-everything bundle round-trips (#1051).
import assert from 'node:assert';
import {
  BUNDLE_KIND, BUNDLE_VERSION, BUNDLE_PARTS, buildBundle, parseBundle, isBundle,
  bundleSummary, bundleMessage, bundleFilename,
} from './bundle.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

// Sanitizers that accept anything except a marked-bad value, and tag good ones
// so we can see each part went through ITS OWN reader.
const pass = (tag) => (v) => (v && v.bad ? { ok: false, error: `${tag} is corrupt` } : { ok: true, value: { tag, v } });
const SAN = Object.fromEntries(BUNDLE_PARTS.map((p) => [p, pass(p)]));

const PARTS = {
  project: { seed: 7, layers: [1] },
  userPalettes: [{ id: 'p1' }],
  favorites: [{ id: 'f1' }],
  keeps: [{ id: 'k1' }, { id: 'k2' }],
  taste: { version: 1 },
  biology: { v: 1 },
  canvasPresets: [{ id: 'mine-1' }],
};

ok('build then parse round-trips every part unchanged', () => {
  const b = buildBundle({ ...PARTS, appVersion: '0.9.0', now: 0 });
  assert.equal(b.kind, BUNDLE_KIND);
  assert.equal(b.version, BUNDLE_VERSION);
  assert.equal(b.exportedAt, '1970-01-01T00:00:00.000Z');
  const r = parseBundle(JSON.parse(JSON.stringify(b)), SAN); // through real JSON
  assert.equal(r.ok, true);
  for (const name of BUNDLE_PARTS) {
    assert.equal(r.parts[name].ok, true, name);
    assert.deepEqual(r.parts[name].value.v, PARTS[name], name);
    assert.equal(r.parts[name].value.tag, name, `${name} went through its own sanitizer`);
  }
  assert.equal(r.appVersion, '0.9.0');
});

ok('parts that are null or absent are left out, not written as null', () => {
  const b = buildBundle({ project: PARTS.project, taste: null, keeps: undefined });
  assert.deepEqual(Object.keys(b.parts), ['project']);
  const r = parseBundle(b, SAN);
  assert.deepEqual(Object.keys(r.parts), ['project']);
});

ok('one corrupt part imports the rest and is named', () => {
  const b = buildBundle({ ...PARTS, favorites: { bad: true } });
  const r = parseBundle(b, SAN);
  assert.equal(r.ok, true);
  assert.equal(r.parts.favorites.ok, false);
  assert.match(r.parts.favorites.error, /favorites is corrupt/);
  assert.equal(r.parts.project.ok, true);
  assert.equal(r.parts.keeps.ok, true);
  const s = bundleSummary(r);
  assert.ok(s.good.includes('project') && !s.good.includes('favorites'));
  assert.deepEqual(s.bad.map((x) => x.name), ['favorites']);
  assert.match(bundleMessage(s, 'Imported'), /^Imported: .*project.*\. Skipped: favorites \(favorites is corrupt\)$/);
});

ok('a sanitizer that throws is contained to its part', () => {
  const san = { ...SAN, keeps: () => { throw new Error('boom'); } };
  const r = parseBundle(buildBundle(PARTS), san);
  assert.equal(r.ok, true);
  assert.equal(r.parts.keeps.ok, false);
  assert.equal(r.parts.keeps.error, 'boom');
  assert.equal(r.parts.project.ok, true);
});

ok('a part with no reader is refused, never trusted', () => {
  const rest = { ...SAN }; delete rest.keeps;
  const r = parseBundle(buildBundle(PARTS), rest);
  assert.equal(r.parts.keeps.ok, false);
  assert.equal(r.parts.keeps.error, 'no reader for this part');
});

ok('non-bundles and unknown versions are refused and change nothing', () => {
  for (const junk of [null, undefined, 5, 'x', [], {}, { kind: 'other' }, { seed: 1, layers: [] }]) {
    const r = parseBundle(junk, SAN);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'not a KC-1 bundle');
    assert.equal(isBundle(junk), false);
  }
  const future = { ...buildBundle(PARTS), version: 2 };
  const r = parseBundle(future, SAN);
  assert.equal(r.ok, false);
  assert.match(r.error, /version 2 is not supported/);
  assert.equal(parseBundle({ ...buildBundle(PARTS), version: undefined }, SAN).ok, false);
});

ok('an empty bundle, or one holding only unknown parts, is refused', () => {
  assert.equal(parseBundle({ kind: BUNDLE_KIND, version: 1, parts: {} }, SAN).ok, false);
  assert.equal(parseBundle({ kind: BUNDLE_KIND, version: 1, parts: { mystery: 1 } }, SAN).ok, false);
  assert.equal(parseBundle({ kind: BUNDLE_KIND, version: 1 }, SAN).ok, false);
  assert.equal(parseBundle({ kind: BUNDLE_KIND, version: 1, parts: [1] }, SAN).ok, false);
});

ok('unknown extra parts are ignored, known ones kept', () => {
  const b = buildBundle(PARTS); b.parts.mystery = { a: 1 };
  const r = parseBundle(b, SAN);
  assert.equal(r.ok, true);
  assert.equal('mystery' in r.parts, false);
});

ok('messages are plain, and the filename is stable', () => {
  const s = { good: ['project', 'userPalettes'], bad: [] };
  assert.equal(bundleMessage(s, 'Exported'), 'Exported: project, palettes');
  assert.equal(bundleMessage({ good: [], bad: [{ name: 'taste', error: 'x' }] }, 'Imported'), 'Imported: nothing. Skipped: taste (x)');
  assert.match(bundleFilename(Date.UTC(2026, 9, 5, 12, 30)), /^kinetic-curator-bundle-2026100\d-\d{4}\.json$/);
});

console.log(`bundle.selfcheck: ${n} checks passed`);
