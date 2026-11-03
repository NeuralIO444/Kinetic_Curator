// creatureAssembler.selfcheck.mjs — #1849 (slice 1 of #1848): the WetLab assembler, measured against its acceptance.
//
//   1. a creature record assembles from ANY pool shape with H / L marked
//   2. reassembly from the same seed + asset + points is identical (byte for byte); the seed is what varies a deal
//   3. a project with records reloads them intact (serialize → JSON → parse → the store's applyProject)
//   4. zero behaviour change on stage: the dish is identical with and without records, and no stage path reads them
//   5. the Look / Voice references resolve to the real decks; the genome carries all five families, value + source
//   6. the trust boundary refuses a dishonest record whole
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assembleCreature,
  sanitizeCreatureRecord,
  sanitizeCreatureRecords,
  GENE_FAMILIES,
  CREATURE_ASSEMBLY_KIND,
  MAX_CREATURE_RECORDS,
  isLookId,
  isVoiceId,
} from './creatureAssembler.js';
import { ASSETS } from '../data/assets/index.js';
import { autoAttachPoints } from './autoAttach.js';
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';
import { useStore } from '../state/store.js';
import { SCENE_KEYS } from '../gl/playback.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const S = () => useStore.getState();
const bytes = (v) => JSON.stringify(v);

/** Mark an asset's points the way an artist would: the first point the head, the next two limbs. */
const marked = (asset) =>
  autoAttachPoints(asset.svg).map((p, i) => ({ ...p, role: i === 0 ? 'H' : i <= 2 ? 'L' : undefined }));

ok('1. every pool shape with H / L marked assembles a record that passes its own door', () => {
  let withHead = 0;
  for (const a of ASSETS) {
    const r = assembleCreature({ assetId: a.id, points: marked(a), seed: 7 });
    assert.ok(r, `${a.id} assembles`);
    assert.equal(r.kind, CREATURE_ASSEMBLY_KIND);
    assert.equal(r.body, a.id, 'the body is the shape');
    assert.deepEqual(
      sanitizeCreatureRecord(JSON.parse(bytes(r))),
      r,
      `${a.id}: the record is exactly what its door keeps`,
    );
    if (r.head) withHead++;
  }
  assert.ok(withHead > ASSETS.length * 0.9, `most shapes carry a head (${withHead}/${ASSETS.length})`);
  // the parts come from the roles: head = H, limbs = L, plain points stay joints
  const pts = [
    { x: 10, y: 10, role: 'L' },
    { x: 50, y: 5, role: 'H' },
    { x: 90, y: 10, role: 'L' },
    { x: 50, y: 95 },
  ];
  const r = assembleCreature({ assetId: ASSETS[0].id, points: pts, seed: 1 });
  assert.deepEqual(r.head, { x: 50, y: 5 });
  assert.deepEqual(r.limbs, [
    { x: 10, y: 10 },
    { x: 90, y: 10 },
  ]);
  assert.deepEqual(r.joints, [{ x: 50, y: 95 }]);
  assert.deepEqual(Object.values(r.drives), [null, null, null, null], 'drive slots are empty — honest');
  // a shape with nothing marked is still a body: no head, no limbs, never a fabricated part
  const bare = assembleCreature({ assetId: ASSETS[0].id, points: [], seed: 1 });
  assert.equal(bare.head, null);
  assert.deepEqual(bare.limbs, []);
  assert.equal(assembleCreature({ assetId: '', points: pts }), null, 'no asset, no record');
});

ok('2. reassembly is byte-identical; the seed (and only the inputs) vary the deal', () => {
  const a = ASSETS[3];
  const one = bytes(assembleCreature({ assetId: a.id, points: marked(a), seed: 1849 }));
  for (let i = 0; i < 5; i++)
    assert.equal(bytes(assembleCreature({ assetId: a.id, points: marked(a), seed: 1849 })), one);
  const deals = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const r = assembleCreature({ assetId: a.id, points: marked(a), seed });
    deals.add(`${r.look}|${r.voice}`);
  }
  assert.ok(deals.size > 20, `seeds deal varied Look/Voice pairs (${deals.size}/40)`);
  const moved = marked(a).map((p, i) => (i === 0 ? { ...p, x: Math.min(100, p.x + 1) } : p));
  assert.notEqual(
    assembleCreature({ assetId: a.id, points: moved, seed: 1849 }).id,
    JSON.parse(one).id,
    'moving a point is a different creature',
  );
  // a named Look / Voice is kept and sourced to its deck; a bogus one falls back to the deal
  const named = assembleCreature({
    assetId: a.id,
    points: marked(a),
    seed: 2,
    lookId: 'praystation',
    voiceId: 'swarm',
  });
  assert.equal(named.look, 'praystation');
  assert.equal(named.voice, 'swarm');
  assert.equal(named.genome.find((g) => g.id === 'look').source, 'look:praystation');
  const bogus = assembleCreature({ assetId: a.id, points: marked(a), seed: 2, lookId: 'nope', voiceId: 'nope' });
  assert.ok(isLookId(bogus.look) && isVoiceId(bogus.voice));
  assert.equal(bogus.genome.find((g) => g.id === 'voice').source, 'dealt');
});

ok(
  '5. Look / Voice resolve to the real decks; the genome carries FORM / LOOK / VOICE / MATERIAL / DRIVE, value + source',
  () => {
    const lookIds = new Set(COMPOSITION_PRESETS.map((p) => p.id));
    const voiceIds = new Set(VOICE_DECK.map((v) => v.id));
    for (let seed = 0; seed < 60; seed++) {
      const a = ASSETS[seed % ASSETS.length];
      const r = assembleCreature({ assetId: a.id, points: marked(a), seed });
      assert.ok(lookIds.has(r.look), `${r.look} is a real Look`);
      assert.ok(voiceIds.has(r.voice), `${r.voice} is a real Voice`);
      const fams = [...new Set(r.genome.map((g) => g.family))];
      assert.deepEqual(fams, [...GENE_FAMILIES], 'all five families, in canonical order');
      for (const g of r.genome) {
        assert.ok('value' in g && typeof g.source === 'string' && g.source.length > 0, `${g.id} has value + source`);
      }
      assert.equal(r.genome.find((g) => g.id === 'look').value, r.look, 'the LOOK gene is the reference');
      assert.equal(r.genome.find((g) => g.id === 'voice').value, r.voice, 'the VOICE gene is the reference');
    }
  },
);

ok('6. the door refuses a dishonest record whole', () => {
  const good = assembleCreature({ assetId: ASSETS[0].id, points: marked(ASSETS[0]), seed: 9 });
  const bad = (patch) => sanitizeCreatureRecord({ ...JSON.parse(bytes(good)), ...patch });
  assert.equal(bad({ kind: 'kc-creature/1' }), null, 'wrong kind');
  assert.equal(bad({ look: 'not-a-look' }), null, 'a Look that resolves to no deck');
  assert.equal(bad({ voice: 'not-a-voice' }), null, 'a Voice that resolves to no deck');
  // consistent but unresolvable: the field and its gene agree on a Look / Voice no deck has
  for (const id of ['look', 'voice']) {
    const c = JSON.parse(bytes(good));
    c[id] = `ghost-${id}`;
    c.genome.find((g) => g.id === id).value = c[id];
    assert.equal(sanitizeCreatureRecord(c), null, `a consistent ${id} that resolves to no deck`);
  }
  assert.equal(bad({ id: 'creature' }), null, 'malformed id');
  assert.equal(bad({ head: { x: 500, y: 5 } }), null, 'a head off the box');
  assert.equal(bad({ limbs: [{ x: 1, y: 1 }] }), null, 'fields disagreeing with their genes');
  assert.equal(
    bad({ drives: { approval: 99, crowding: null, strain: null, boredom: null } }),
    null,
    'a drive slot out of range',
  );
  const hot = JSON.parse(bytes(good));
  hot.genome.find((x) => x.id === 'approval').value = 99;
  assert.equal(sanitizeCreatureRecord(hot), null, 'a drive gene out of range is refused, never clamped');
  const src = JSON.parse(bytes(good));
  src.genome[0].source = 'from the internet <script>';
  assert.equal(sanitizeCreatureRecord(src), null, 'a source outside the grammar');
  const g = JSON.parse(bytes(good));
  g.genome = g.genome.slice(0, -1);
  assert.equal(sanitizeCreatureRecord(g), null, 'a gene missing');
  const swapped = JSON.parse(bytes(good));
  swapped.genome = [swapped.genome[1], swapped.genome[0], ...swapped.genome.slice(2)];
  assert.equal(sanitizeCreatureRecord(swapped), null, 'genes out of order');
  assert.equal(sanitizeCreatureRecord(null), null);
  assert.deepEqual(sanitizeCreatureRecords('x'), []);
  assert.deepEqual(sanitizeCreatureRecords([good, good, { kind: 'x' }]), [good], 'de-duplicated, junk dropped');
  const many = Array.from({ length: MAX_CREATURE_RECORDS + 5 }, (_, i) =>
    assembleCreature({ assetId: ASSETS[0].id, points: [], seed: i + 1 }),
  );
  assert.equal(sanitizeCreatureRecords(many).length, MAX_CREATURE_RECORDS, 'capped');
});

ok(
  'store: ASSEMBLE banks a record off the project seed; the same assembly twice is one record; remove drops it',
  () => {
    const a = ASSETS[5];
    useStore.setState({ seed: 0x1849, creatureRecords: [] });
    S().assembleCreature(a.id, marked(a));
    assert.equal(S().creatureRecords.length, 1);
    const rec = S().creatureRecords[0];
    assert.deepEqual(rec, assembleCreature({ assetId: a.id, points: marked(a), seed: 0x1849 }));
    const list = S().creatureRecords;
    S().assembleCreature(a.id, marked(a));
    assert.equal(S().creatureRecords, list, 'reassembling the same creature is a no-op');
    useStore.setState({ seed: 0x1850 });
    S().assembleCreature(a.id, marked(a));
    assert.equal(S().creatureRecords.length, 2, 'a new seed is a new deal');
    S().removeCreatureRecord(rec.id);
    assert.equal(S().creatureRecords.length, 1);
    assert.ok(!S().creatureRecords.some((r) => r.id === rec.id));
  },
);

ok('store: the lab is told what the press did; a full bank refuses instead of evicting another creature', () => {
  const a = ASSETS[6];
  useStore.setState({ seed: 11, creatureRecords: [], creatureAssembleNote: null });
  S().assembleCreature(a.id, marked(a));
  assert.equal(S().creatureAssembleNote.status, 'banked');
  S().assembleCreature(a.id, marked(a));
  assert.equal(S().creatureAssembleNote.status, 'already');
  const full = Array.from({ length: MAX_CREATURE_RECORDS }, (_, i) =>
    assembleCreature({ assetId: ASSETS[1].id, points: [], seed: 1000 + i }),
  );
  useStore.setState({ creatureRecords: full, seed: 99 });
  S().assembleCreature(a.id, marked(a));
  assert.equal(S().creatureAssembleNote.status, 'full');
  assert.equal(S().creatureRecords, full, 'nothing evicted');
});

ok('custom (user:) assets assemble and round-trip like library shapes', () => {
  const r = assembleCreature({ assetId: 'user:my-shape', points: [{ x: 50, y: 10, role: 'H' }], seed: 3 });
  assert.equal(r.body, 'user:my-shape');
  assert.deepEqual(sanitizeCreatureRecord(JSON.parse(bytes(r))), r);
});

ok("forward compatibility: a newer build's genes and drives survive this build's load AND its next save", () => {
  const good = assembleCreature({ assetId: ASSETS[0].id, points: marked(ASSETS[0]), seed: 21 });
  const newer = JSON.parse(bytes(good));
  newer.genome.push({ family: 'PATTERN', id: 'tile', value: { kind: 'hex', n: 6 }, source: 'parent:cr-0000beef' });
  newer.genome.push({ family: 'DRIVE', id: 'hunger', value: 1.2, source: 'mut:cr-0000beef~3' });
  newer.drives.hunger = 0.8;
  newer.drives.approval = 1.5;
  const kept = sanitizeCreatureRecord(newer);
  assert.ok(kept, 'the newer record loads');
  assert.deepEqual(kept, newer, 'every addition is kept verbatim');
  const doc = JSON.parse(JSON.stringify(serializeProject({ ...S(), creatureRecords: [newer] })));
  assert.deepEqual(doc.creatureRecords, [newer], 'and survives the next save');
  const bad1 = JSON.parse(bytes(newer));
  bad1.genome.push({ family: 'pattern', id: 'Tile', value: 1, source: 'wild' });
  assert.equal(sanitizeCreatureRecord(bad1), null, 'a malformed addition');
  const bad2 = JSON.parse(bytes(newer));
  bad2.genome.push({ ...bad2.genome[4] });
  assert.equal(sanitizeCreatureRecord(bad2), null, 'a gene is one gene');
  const bad3 = JSON.parse(bytes(good));
  for (let i = 0; i < 80; i++) bad3.genome.push({ family: 'XY', id: `g${i}`, value: i, source: 'wild' });
  assert.equal(sanitizeCreatureRecord(bad3), null, 'capped');
  const fine = JSON.parse(bytes(good));
  fine.joints = fine.joints.map((p) => ({ x: p.x + 0.001, y: p.y }));
  fine.genome.find((g) => g.id === 'joints').value = fine.joints;
  assert.deepEqual(sanitizeCreatureRecord(fine).joints, good.joints, 'snapped back to 2 decimals');
});

ok('hostile documents never throw: 600 mangled records are refused or kept, never crash the loader', () => {
  const base = bytes(assembleCreature({ assetId: ASSETS[0].id, points: marked(ASSETS[0]), seed: 5 }));
  let s = 0x1849;
  const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const junk = [null, 0, -1, 1e309, 'x', [], {}, true, { x: 1 }, [[1]], 'look:praystation'];
  const fields = ['kind', 'id', 'seed', 'body', 'head', 'look', 'voice', 'drives', 'genome'];
  let refused = 0;
  for (let i = 0; i < 600; i++) {
    const r = JSON.parse(base);
    const mangle = pick([
      () => (r[pick(fields)] = pick(junk)),
      () => (r.genome[Math.floor(rnd() * r.genome.length)] = pick(junk)),
      () => (r.genome[Math.floor(rnd() * r.genome.length)].value = pick(junk)),
      () => (r.drives[pick(Object.keys(r.drives))] = pick(junk)),
    ]);
    mangle();
    let out;
    assert.doesNotThrow(() => (out = sanitizeCreatureRecords([r])));
    if (!out.length) refused++;
  }
  assert.ok(refused > 400, `most mangles are refused (${refused}/600)`);
});

ok('3. a project with records reloads them intact, byte-stable, through the real save and load', () => {
  const recs = [0, 1, 2].map((i) =>
    assembleCreature({ assetId: ASSETS[i].id, points: marked(ASSETS[i]), seed: 100 + i }),
  );
  useStore.setState({ creatureRecords: recs });
  const text = JSON.stringify(serializeProject(S()));
  const parsed = parseProject(JSON.parse(text));
  assert.ok(parsed.ok, parsed.error);
  assert.equal(bytes(parsed.doc.creatureRecords), bytes(recs), 'the document round-trips byte for byte');
  useStore.setState({ creatureRecords: [] });
  S().applyProject(parsed.doc);
  assert.equal(bytes(S().creatureRecords), bytes(recs), 'the store holds them again after a load');
  // a second save is the same bytes (stable), and a project without records writes no field (exports as before)
  assert.equal(JSON.stringify(serializeProject(S())), text);
  useStore.setState({ creatureRecords: [] });
  assert.ok(!('creatureRecords' in serializeProject(S())), 'no records, no field');
  S().applyProject(parseProject(JSON.parse(JSON.stringify(serializeProject(S())))).doc);
  assert.deepEqual(S().creatureRecords, [], 'a doc without records loads none');
});

ok('4. zero behaviour change on stage: assembling moves only the record bank, and no stage path reads it', () => {
  // the store: an ASSEMBLE press changes the record bank and its note, and nothing else in the store
  const a = ASSETS[2];
  useStore.setState({ creatureRecords: [], creatureAssembleNote: null });
  const snapshot = () => {
    const o = {};
    for (const [k, v] of Object.entries(S())) if (typeof v !== 'function') o[k] = bytes(v);
    return o;
  };
  const before = snapshot();
  S().assembleCreature(a.id, marked(a));
  const after = snapshot();
  const moved = Object.keys(after).filter((k) => after[k] !== before[k]);
  // #1850 re-pin (cause: Matt's ruling 2026-11-02 — an assembled creature joins the asset pool as a tile): an ASSEMBLE
  // press now also adds that tile to the overlay (customAssets). Still nothing else moves — no layout, no pool switch,
  // no seed: the tile reaches the stage only when the artist turns it on (creatureInjection.selfcheck.mjs).
  assert.deepEqual(
    moved.sort(),
    ['creatureAssembleNote', 'creatureRecords', 'customAssets'],
    `assemble moved: ${moved.join(', ')}`,
  );
  assert.ok(!SCENE_KEYS.includes('creatureRecords'), 'takes do not carry records (nothing on stage reads them)');
  // the only readers are the assembler, the store, the project file and the wet lab
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const allowed = new Set([
    'engine/creatureAssembler.js',
    'engine/creatureAssembler.selfcheck.mjs',
    'state/slices/globalSlice.js',
    'state/projectDocument.js',
    'state/projectWatch.mjs',
    'panels/WetLab.jsx',
    // #1850: the deal filter imports only the tile-id test (keeps creature tiles undealt) — it never reads a record;
    // the stage reaches a creature through its pool TILE, never through creatureRecords
    'state/rollPool.mjs',
    'engine/creatureInjection.selfcheck.mjs',
    // #1850: the one-file bundle carries the records with their tiles — persistence, like projectDocument, not stage
    'hooks/useProjectPayload.js',
    'panels/pipeline/DataExportRow.jsx',
  ]);
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(js|mjs|jsx)$/.test(e)) continue;
      const rel = relative(root, p);
      if (allowed.has(rel)) continue;
      if (/creatureRecords|creatureAssembler/.test(readFileSync(p, 'utf8'))) hits.push(rel);
    }
  };
  walk(root);
  assert.deepEqual(hits, [], `stage-side readers of creature records: ${hits.join(', ')}`);
});

console.log(`creatureAssembler.selfcheck: ${n} checks passed`);
