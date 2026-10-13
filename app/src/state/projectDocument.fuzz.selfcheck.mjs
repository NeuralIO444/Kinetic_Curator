// node src/state/projectDocument.fuzz.selfcheck.mjs
// Persistence fuzz: the project document is the trust boundary (files, autosave, bundles, a shared link). Property tests,
// seeded so a failure reproduces:
//   1. parseProject never throws, whatever it is handed
//   2. sanitising is a FIXED POINT: parse(parse(x).doc).doc deep-equals parse(x).doc (nothing is "repaired" twice)
//   3. what it returns is plain JSON (survives stringify/parse unchanged) and carries no prototype-polluting keys
//   4. a hostile value in one field never damages another (the rest of a good document survives)
//   5. a document the app itself wrote round-trips to itself
import assert from 'node:assert/strict';
import { useStore } from './store.js';
import { serializeProject, parseProject } from './projectDocument.js';

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(0x5eed1234);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// a document the app itself writes, with the newer fields set so they are exercised too
useStore.setState({ creatureCount: 3, assetAttach: { org_blob_01: [{ x: 20, y: 30 }, { x: 70, y: 60 }], geo_tri_01: [] } });
const good = JSON.parse(JSON.stringify(serializeProject(useStore.getState())));

// 5. the app's own document is a fixed point of its own parser
{
  const p = parseProject(good);
  assert.equal(p.ok, true, JSON.stringify(p).slice(0, 200));
  assert.deepEqual(parseProject(p.doc).doc, p.doc, 'parse of a parsed document changes nothing');
  assert.deepEqual(p.doc.assetAttach, good.assetAttach, 'attach points survive');
  if ('creatureCount' in good) assert.equal(p.doc.creatureCount, good.creatureCount, 'the creature count survives');
}

const JUNK = [
  () => null, () => undefined, () => NaN, () => Infinity, () => -Infinity, () => -0, () => 1e308, () => -1e308, () => 0.1 + 0.2,
  () => '', () => 'x'.repeat(5000), () => '<script>alert(1)</script>', () => '../../etc/passwd', () => '\u0000￿',
  () => true, () => false, () => [], () => [[]], () => Array.from({ length: 300 }, (_, i) => i), () => ({}), () => ({ a: { b: { c: {} } } }),
  () => ({ __proto__: { polluted: 1 } }), () => JSON.parse('{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}}}'),
  () => Math.floor(rnd() * 1e9), () => rnd() * 1000 - 500, () => 'palette-' + Math.floor(rnd() * 100),
];
const junk = () => pick(JUNK)();

/** A copy of `doc` with n random top-level or one-level-deep fields replaced by junk. */
function mutate(doc, n) {
  const out = JSON.parse(JSON.stringify(doc));
  const keys = Object.keys(out);
  const touched = [];
  for (let i = 0; i < n; i++) {
    const k = pick(keys);
    if (rnd() < 0.5 || out[k] === null || typeof out[k] !== 'object' || Array.isArray(out[k])) { out[k] = junk(); touched.push(k); continue; }
    const sub = Object.keys(out[k]);
    if (!sub.length) { out[k] = junk(); touched.push(k); continue; }
    out[k][pick(sub)] = junk(); touched.push(k);
  }
  return { doc: out, touched };
}

const polluted = () => ({}).polluted !== undefined || Object.prototype.polluted !== undefined;
const plainKeys = (v, path = '') => {
  if (Array.isArray(v)) return v.forEach((x, i) => plainKeys(x, `${path}[${i}]`));
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      assert.ok(k !== '__proto__' && k !== 'constructor' && k !== 'prototype', `a prototype key survived at ${path}.${k}`);
      plainKeys(v[k], `${path}.${k}`);
    }
  }
};

// 1-3. mutation fuzz
let ok = 0; let rejected = 0;
for (let i = 0; i < 400; i++) {
  const { doc } = mutate(good, 1 + Math.floor(rnd() * 5));
  let p;
  assert.doesNotThrow(() => { p = parseProject(doc); }, `iteration ${i}: parseProject threw`);
  assert.ok(p && typeof p.ok === 'boolean', 'always an answer');
  if (!p.ok) { rejected++; continue; }
  ok++;
  const again = parseProject(JSON.parse(JSON.stringify(p.doc)));
  assert.equal(again.ok, true, `iteration ${i}: a sanitized document must be accepted`);
  assert.deepEqual(again.doc, p.doc, `iteration ${i}: sanitising is a fixed point`);
  assert.deepEqual(JSON.parse(JSON.stringify(p.doc)), p.doc, `iteration ${i}: the document is plain JSON`);
  plainKeys(p.doc);
  assert.ok(!polluted(), 'the prototype was not polluted');
}
assert.ok(ok > 150, `most hostile documents are repaired rather than refused (${ok} accepted, ${rejected} refused)`);

// 4. whole-document junk never throws either
for (const j of [null, undefined, 0, 1, 'x', [], [1, 2], true, NaN, () => 1, Symbol('x'), { version: 1 }, { version: 999 }, { layers: 'no' }]) {
  assert.doesNotThrow(() => parseProject(j), `parseProject(${String(j).slice(0, 30)}) threw`);
}

// 5b. one bad field does not cost the good ones
{
  for (const k of ['layoutParams', 'palette', 'seed', 'light', 'assetKineme', 'audioRoutes']) {
    if (!(k in good)) continue;
    const bad = { ...good, [k]: { not: ['a', 'valid', { value: NaN }] } };
    const p = parseProject(bad);
    if (!p.ok) continue; // refused outright is allowed; silently corrupting the rest is not
    assert.deepEqual(p.doc.assetAttach, good.assetAttach, `a bad ${k} left the attach points alone`);
    if ('creatureCount' in good) assert.equal(p.doc.creatureCount, good.creatureCount, `a bad ${k} left the creature count alone`);
  }
}

console.log(`projectDocument.fuzz.selfcheck: ok (400 mutated documents: ${ok} repaired, ${rejected} refused; all fixed points)`);
