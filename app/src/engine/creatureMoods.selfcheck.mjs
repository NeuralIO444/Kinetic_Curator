// creatureMoods.selfcheck.mjs — #1949 (of #1848): Lois's and Davis's live moods reach the creature rigs.
// Matt's rulings (2026-11-03): Lois moves — her face picks the gait; Davis picks how varied his deal is — BLOOM / FLOW
// open it (every bone its own shape), STUCK / SIFT tighten it (a creature's limbs all wear one shape), anything else
// deals as before.
//
//   codes     only the personas' own codes pass the room-codes door; a broken provider reads as no codes
//   gait      each Lois face poses the rigs differently through the real contract; none / unknown = NOD
//   davis     wide → no two bones share a shape (pile allowing); tight → all limbs one shape; plain → byte-identical
//   replay    the codes ride the resolver input (a take records them) and the contract reads the frame's EFFECTIVE input
//             (a take's recorded one in playback): a take replays its moods, an older take replays the defaults
//   wiring    the live loop stamps the codes and passes the effective input's codes to the contract (source-level)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleCreature, creatureTile, creatureTileId } from './creatureAssembler.js';
import { LOIS_GAITS, DAVIS_VARIETY, varietyFor, gaitFor } from './creatureRig.js';
import { ASSETS } from '../data/assets/index.js';
import { sanitizeOverlay } from '../assets/overlay.js';
import { buildSceneContract } from '../gl/sceneContract.js';
import { setRoomCodesProvider, readRoomCodes, sanitizeRoomCodes, roomContractFields } from '../curator/roomCodes.js';
import { LOIS_FACES } from '../curator/loisFace.js';
import { DAVIS_STATES } from '../curator/davisState.js';
import { withResolveTap, lastResolvedInput, setResolveTap, setResolveOutputTap } from '../gl/resolveTap.mjs';
import { createPerformanceRecorder } from '../gl/performanceFile.mjs';
import { startPlayback, stopPlayback } from '../gl/playback.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const okA = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const body = ASSETS.find((a) => a.id === 'org_blob_01');
const rec = assembleCreature({
  assetId: body.id,
  points: [
    { x: 50, y: 6, role: 'H' },
    { x: 12, y: 70, role: 'L' },
    { x: 88, y: 70, role: 'L' },
    { x: 80, y: 85 },
  ],
  seed: 1949,
});
const [tile] = sanitizeOverlay([creatureTile(rec, body)]);
const STAGE = [
  'geo_tri_02',
  'org_petal_01',
  'flora_flower_01',
  'line_squiggle_03',
  'geo_hex_01',
  'dot_field_01',
  'mrk_sun_01',
];
const items = [
  { assetId: tile.id, x: 300, y: 260, scale: 3, rotation: 0, key: 'a' },
  ...STAGE.map((id, i) => ({ assetId: id, x: 60 + i * 110, y: 480, scale: 0.5, rotation: 0, key: `s${i}` })),
].map((it) => ({ color: '#1b1b1b', accent: '#e8553a', alpha: 100, seedOffset: 0, ...it }));
const contract = (doc = {}) =>
  buildSceneContract({
    doc: { seed: 7, customAssets: [tile], kinemeTime: 0.6, ...doc },
    resolvedLayers: [{ id: 'L', isFx: false, items }],
  });
const parts = (c) => c.instances.filter((i) => i.key.startsWith('a#'));
const limbParts = (c) => parts(c).filter((p) => !p.key.endsWith('#h'));

ok('codes: only the personas’ own codes pass; a broken provider reads as none', () => {
  assert.deepEqual(Object.keys(LOIS_GAITS).sort(), Object.keys(LOIS_FACES).sort(), 'a gait for every Lois face');
  for (const k of Object.keys(DAVIS_VARIETY)) assert.ok(k in DAVIS_STATES, `${k} is a Davis state`);
  assert.deepEqual(sanitizeRoomCodes({ lois: 'BURN', davis: 'FLOW' }), { lois: 'BURN', davis: 'FLOW' });
  assert.deepEqual(sanitizeRoomCodes({ lois: 'burn', davis: '<x>' }), { lois: null, davis: null });
  setRoomCodesProvider(() => {
    throw new Error('feed down');
  });
  assert.deepEqual(readRoomCodes(), { lois: null, davis: null });
  setRoomCodesProvider(() => ({ lois: 'CUT', davis: 'STUCK' }));
  assert.deepEqual(readRoomCodes(), { lois: 'CUT', davis: 'STUCK' });
  setRoomCodesProvider(null);
  assert.deepEqual(roomContractFields({ room: { lois: 'VIBE', davis: 'NOPE' } }), { loisFace: 'VIBE' });
  assert.deepEqual(roomContractFields(null), {}, 'no codes, no fields: a contract without moods is unchanged');
});

ok('gait: each Lois face poses the rig differently through the real contract; none / unknown = NOD', () => {
  const pose = (face) =>
    JSON.stringify(parts(contract(face ? { loisFace: face } : {})).map((p) => [p.x, p.y, p.rotation]));
  const poses = Object.keys(LOIS_FACES).map(pose);
  assert.equal(new Set(poses).size, poses.length, 'five faces, five gaits');
  assert.equal(pose(null), pose('NOD'), 'no face walks NOD');
  assert.equal(pose('SMIRK'), pose('NOD'), 'an unknown face walks NOD');
  assert.equal(gaitFor('BURN'), LOIS_GAITS.BURN);
});

ok('davis: wide → every bone its own shape; tight → all limbs one shape; anything else → the plain deal', () => {
  const plain = parts(contract()).map((p) => p.asset);
  for (const d of ['SEEDLING', null, 'NOPE']) {
    assert.deepEqual(
      parts(contract(d ? { davisMood: d } : {})).map((p) => p.asset),
      plain,
      `${d}: as before`,
    );
  }
  for (const d of ['BLOOM', 'FLOW']) {
    const a = parts(contract({ davisMood: d })).map((p) => p.asset);
    assert.equal(new Set(a).size, a.length, `${d}: no two bones share a shape (pile of ${STAGE.length})`);
    assert.equal(varietyFor(d), 'wide');
  }
  for (const d of ['STUCK', 'UGLY']) {
    const c = contract({ davisMood: d });
    assert.equal(new Set(limbParts(c).map((p) => p.asset)).size, 1, `${d}: every limb one shape`);
    assert.equal(varietyFor(d), 'tight');
  }
  assert.ok(new Set(plain.slice(0, -1)).size > 1, 'the plain deal varies (so tight is a real change)');
  // never per frame: the deal is the same at every time under a held mood
  for (const d of ['BLOOM', 'STUCK']) {
    const at = (t) => parts(contract({ davisMood: d, kinemeTime: t })).map((p) => p.asset);
    assert.deepEqual(at(0.1), at(2.9), `${d}: steady over time`);
  }
});

await okA(
  'replay: a recorded take plays its own moods, whatever the live room says; an older take, the defaults',
  async () => {
    // record a short take through the real recorder + tap, with the room in BURN / BLOOM
    const L = (id) => ({ id, name: id, visible: true, layerBlendMode: 'normal', layerOpacity: 1 });
    const base = { canvasW: 640, canvasH: 480, layers: [L('a')], activeLayerId: 'a', seed: 4242, dtSec: 1 / 60 };
    const fake = () => ({ resolveLayers: () => ({ layers: [] }), dispose() {} });
    const take = (room, frames = 70) => {
      const rec = createPerformanceRecorder();
      const r = withResolveTap(fake);
      setResolveTap((i) => rec.onInput(i));
      setResolveOutputTap((o) => rec.onOutput(o));
      for (let f = 0; f < frames; f++) r.resolveLayers({ ...base, loopTimeMs: f * 16.7, ...(room ? { room } : {}) });
      setResolveTap(null);
      setResolveOutputTap(null);
      return rec.finish();
    };
    // live: the contract fields follow the live input
    const live = withResolveTap(fake);
    live.resolveLayers({ ...base, loopTimeMs: 0, room: { lois: 'NOD', davis: 'SEEDLING' } });
    assert.deepEqual(roomContractFields(lastResolvedInput()), { loisFace: 'NOD', davisMood: 'SEEDLING' });
    // playback: the take's moods, though the live room is NOD / SEEDLING
    assert.equal(startPlayback(take({ lois: 'BURN', davis: 'BLOOM' })), true);
    live.resolveLayers({ ...base, loopTimeMs: 0, room: { lois: 'NOD', davis: 'SEEDLING' } });
    assert.deepEqual(
      roomContractFields(lastResolvedInput()),
      { loisFace: 'BURN', davisMood: 'BLOOM' },
      'the take’s room',
    );
    stopPlayback();
    // an older take (no room on its inputs): the defaults, not the live room
    assert.equal(startPlayback(take(null)), true);
    live.resolveLayers({ ...base, loopTimeMs: 0, room: { lois: 'NOD', davis: 'STUCK' } });
    assert.deepEqual(roomContractFields(lastResolvedInput()), {}, 'an older take replays the defaults');
    stopPlayback();
  },
);

ok('wiring: the live loop stamps the codes on the input and hands the effective input’s codes to the contract', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../gl/liveLoop.mjs'), 'utf8');
  assert.match(src, /room: readRoomCodes\(\),/, 'stamped on the resolver input (a take records it)');
  assert.match(src, /\.\.\.roomContractFields\(lastResolvedInput\(\)\),/, 'the contract reads the effective input');
  const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../App.jsx'), 'utf8');
  assert.match(app, /setRoomCodesProvider\(roomCodes\)/, 'App provides the room’s codes');
  assert.ok(creatureTileId(rec.id) === tile.id);
});

console.log(`creatureMoods.selfcheck: ${n} checks passed`);
