// node src/curator/spawn.selfcheck.mjs
// #1355 AUTO SPAWN — how many creatures is the artist's number; each finds its own home in the middle of the dish,
// where the formation rule would let it live.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SPAWN_REGION, MAX_CREATURES, SPAWN_GAP, SPAWN_MARGIN, sanitizeCount, marksOf, chooseHomes,
} from './spawn.js';
import { observeSpawn, resetSpawn, getSpawnHomes, RETRY_FRAMES, PATIENCE_FRAMES } from './spawnLive.js';
import { thresholdsFor, conditionsHold, fertilityField } from './formation.js';
import { DISH_RADIUS, DISH_SATURATE, pinPressures } from './dishPressure.js';
import { BAND_NORMAL, BAND_RELAX, BAND_TIGHTEN } from './stress.js';

const W = 1000; const H = 700;
const fertile = () => 0.9; // everywhere fertile
const barren = () => 0.1;
/** n marks piled at a point (flat x,y list). */
const pile = (x, y, n) => Array.from({ length: n }, (_, i) => [x + (i % 5), y + (i % 4)]).flat();
const inRegion = (p) => p.x >= SPAWN_REGION.x0 * W - 1e-6 && p.x <= SPAWN_REGION.x1 * W + 1e-6 && p.y >= SPAWN_REGION.y0 * H - 1e-6 && p.y <= SPAWN_REGION.y1 * H + 1e-6;

// 1. the count is a whole number 0..4
{
  assert.equal(MAX_CREATURES, 4);
  assert.deepEqual([0, 1, 4, 5, -3, 2.6, NaN, 'x', null].map(sanitizeCount), [0, 1, 4, 4, 0, 3, 0, 0, 0]);
}

// 2. a home is in the middle region, and the nearest qualifying spot to the centre wins
{
  const marks = [...pile(500, 350, 40), ...pile(300, 300, 40), ...pile(700, 450, 40)];
  const h = chooseHomes({ count: 1, marks, field: fertile });
  assert.equal(h.length, 1);
  assert.ok(inRegion(h[0]));
  assert.ok(Math.hypot(h[0].x - 500, h[0].y - 350) < 40, 'the crowd at the centre wins');
  // no crowd in the middle: the nearest crowded spot that is inside the region
  const off = chooseHomes({ count: 1, marks: pile(300, 300, 40), field: fertile });
  assert.ok(inRegion(off[0]) && Math.hypot(off[0].x - 300, off[0].y - 300) < 90, 'the crowded corner of the middle region');
  // a crowd outside the middle region is a home only as a last resort: the middle crowd wins when there is one
  const both = chooseHomes({ count: 1, marks: [...pile(60, 60, 60), ...pile(500, 350, 40)], field: fertile });
  assert.ok(inRegion(both[0]), 'the middle first');
  const outer = chooseHomes({ count: 1, marks: pile(60, 60, 60), field: fertile });
  assert.equal(outer.length, 1, 'with nothing in the middle, the dish is searched outward rather than leaving the moth out');
  assert.ok(outer[0].x >= 0 && outer[0].x <= W && outer[0].y >= 0 && outer[0].y <= H);
  // Matt, 2026-10-13: asked for four, got three. Four crowds, two of them close together: the full spacing fits three, so
  // the spacing closes up (then the region opens) until the fourth is found. The bars to FORM are never relaxed.
  const crowds = [...pile(500, 350, 40), ...pile(330, 300, 40), ...pile(670, 300, 40), ...pile(560, 470, 40)];
  const four = chooseHomes({ count: 4, marks: crowds, field: fertile });
  assert.equal(four.length, 4, 'all four asked for are found');
  const noGap = chooseHomes({ count: 4, marks: [...pile(500, 350, 40), ...pile(330, 300, 40), ...pile(100, 100, 40), ...pile(900, 600, 40)], field: fertile });
  assert.equal(noGap.length, 4, 'crowds in the corners are found once the middle is full');
  assert.equal(chooseHomes({ count: 4, marks: crowds, field: barren }).length, 0, 'fertility is never relaxed');
  assert.equal(chooseHomes({ count: 4, marks: pile(500, 350, 2), field: fertile }).length, 0, 'the crowd is never relaxed');
}

// 3. it only picks places where the formation rule would let a creature form
{
  const marks = pile(500, 350, 40);
  assert.deepEqual(chooseHomes({ count: 1, marks, field: barren }), [], 'barren ground: no home');
  assert.deepEqual(chooseHomes({ count: 1, marks: pile(500, 350, 3), field: fertile }), [], 'no crowd: no home');
  // every chosen home passes the rule's own test at that point and band
  for (const band of [BAND_RELAX, BAND_NORMAL, BAND_TIGHTEN]) {
    const field = fertilityField(31, null, W, H).at;
    const m = [];
    for (let x = 200; x <= 800; x += 40) for (let y = 140; y <= 560; y += 35) m.push(...pile(x, y, 30));
    const homes = chooseHomes({ count: 4, marks: m, field, band });
    for (const p of homes) {
      const dens = pinPressures([p], [{ items: Array.from({ length: m.length / 2 }, (_, i) => ({ x: m[2 * i], y: m[2 * i + 1] })) }], W, H)[0];
      assert.ok(conditionsHold(field(p.x, p.y), dens, band), `${band}: a home passes the formation rule (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
      assert.ok(field(p.x, p.y) > thresholdsFor(band).attraction + SPAWN_MARGIN - 1e-9, 'with the margin');
    }
    assert.ok(homes.length >= 1, `${band}: a rich dish finds homes (${homes.length})`);
  }
}

// 4. several creatures are spaced, at most four, existing homes never move, and a poor dish gives fewer
{
  const m = [];
  for (let x = 200; x <= 800; x += 40) for (let y = 140; y <= 560; y += 35) m.push(...pile(x, y, 30));
  const four = chooseHomes({ count: 9, marks: m, field: fertile });
  assert.equal(four.length, 4, 'never more than the TE four');
  const gap = SPAWN_GAP * Math.min(W, H);
  for (let i = 0; i < four.length; i++) for (let j = i + 1; j < four.length; j++) assert.ok(Math.hypot(four[i].x - four[j].x, four[i].y - four[j].y) >= gap - 1e-9);
  const keep = chooseHomes({ count: 2, existing: [{ x: 333, y: 222 }], marks: m, field: fertile });
  assert.deepEqual(keep[0], { x: 333, y: 222 }, 'an existing home is kept exactly');
  assert.equal(keep.length, 2);
  assert.equal(chooseHomes({ count: 1, existing: four, marks: m, field: fertile }).length, 1, 'a lower count keeps the first');
  const poor = chooseHomes({ count: 4, marks: pile(500, 350, 40), field: fertile });
  assert.ok(poor.length >= 1 && poor.length < 4, `one crowd gives fewer than four homes (${poor.length}), not four crammed together`);
  assert.deepEqual(chooseHomes({ count: 0, marks: m, field: fertile }), []);
  assert.deepEqual(chooseHomes({ count: 2, marks: m }), [], 'no field, no home');
  assert.deepEqual(chooseHomes({ count: 3, marks: m, field: fertile }), chooseHomes({ count: 3, marks: m, field: fertile }), 'deterministic');
}

// 5. the marks are the dish's, never a creature's own
{
  const out = [{ items: [{ x: 1, y: 2 }, { x: 3, y: 4, _creature: true }, { x: NaN, y: 0 }, null] }, { isPattern: true }, { items: [{ x: 5, y: 6 }] }];
  assert.deepEqual(marksOf(out), [1, 2, 5, 6]);
  assert.deepEqual(marksOf(null), []);
}

// 6. LIVE: steady homes, re-picked only when the dish changes, retried while incomplete, patience for a home that never forms
{
  const crowd = (n = 40) => [{ items: Array.from({ length: n }, (_, i) => ({ x: 500 + (i % 5), y: 350 + (i % 4) })) }];
  const inp = (over = {}) => ({ canvasW: W, canvasH: H, seed: 5, seedOffsets: null, ...over });
  resetSpawn();
  // nothing asked: nothing happens
  assert.equal(observeSpawn(inp(), crowd(), { count: 0 }), null);
  assert.deepEqual(getSpawnHomes(), []);
  // asked for one: it finds a home on the first look (the fertile spot in a seed we know), publishes it once
  const field = fertilityField(5, null, W, H).at;
  const fertileHere = field(500, 350) > thresholdsFor(null).attraction + SPAWN_MARGIN;
  // use a seed whose centre is fertile so the test is about the tracker, not luck
  let seed = 5;
  for (let s = 1; s < 80; s++) { if (fertilityField(s, null, W, H).at(500, 350) > 0.7) { seed = s; break; } }
  resetSpawn();
  const first = observeSpawn(inp({ seed }), crowd(), { count: 1 });
  assert.ok(first && first.length === 1 && inRegion(first[0]), `a home is found (${fertileHere})`);
  assert.equal(observeSpawn(inp({ seed }), crowd(), { count: 1, formed: [true] }), null, 'steady: nothing new to publish');
  const home = getSpawnHomes()[0];
  for (let i = 0; i < 400; i++) observeSpawn(inp({ seed }), crowd(0), { count: 1, formed: [true] });
  assert.deepEqual(getSpawnHomes()[0], home, 'a formed creature keeps its home however the dish moves');
  // a new seed is a new dish
  const next = observeSpawn(inp({ seed: seed + 1 }), crowd(), { count: 1, formed: [true] });
  assert.ok(next === null || next.length <= 1);
  // raising the count adds, never moves the first; lowering drops
  resetSpawn();
  const rich = []; for (let x = 200; x <= 800; x += 40) for (let y = 140; y <= 560; y += 35) for (let i = 0; i < 30; i++) rich.push({ x: x + (i % 5), y: y + (i % 4) });
  const richOut = [{ items: rich }];
  observeSpawn(inp({ seed }), richOut, { count: 1 });
  const one = getSpawnHomes();
  observeSpawn(inp({ seed }), richOut, { count: 3, formed: [true] });
  for (let i = 0; i < RETRY_FRAMES; i++) observeSpawn(inp({ seed }), richOut, { count: 3, formed: [true, true, true] });
  const three = getSpawnHomes();
  assert.ok(three.length >= 2, `raising the count adds homes (${three.length})`);
  assert.deepEqual(three[0], one[0], 'the first home did not move');
  const pub = observeSpawn(inp({ seed }), richOut, { count: 1, formed: [true, true, true] });
  assert.equal(getSpawnHomes().length, 1, 'lowering the count drops the extras');
  assert.ok(pub && pub.length === 1);
  // patience: a home whose creature never forms (the crowd left) is given up after PATIENCE_FRAMES, and published as gone
  resetSpawn();
  observeSpawn(inp({ seed }), richOut, { count: 1 });
  assert.equal(getSpawnHomes().length, 1);
  let gone = null;
  for (let i = 0; i < PATIENCE_FRAMES - 2; i++) observeSpawn(inp({ seed }), [{ items: [] }], { count: 1, formed: [false] });
  assert.equal(getSpawnHomes().length, 1, 'still patient');
  for (let i = 0; i < 4; i++) { const r = observeSpawn(inp({ seed }), [{ items: [] }], { count: 1, formed: [false] }); if (r && !gone) gone = r; }
  assert.deepEqual(gone, [], 'the barren home is given up and published as gone');
  // and a home that DID form is never given up, however empty the dish gets
  resetSpawn();
  observeSpawn(inp({ seed }), richOut, { count: 1 });
  for (let i = 0; i < PATIENCE_FRAMES * 3; i++) observeSpawn(inp({ seed }), [{ items: [] }], { count: 1, formed: [true] });
  assert.equal(getSpawnHomes().length, 1, 'a living creature keeps its home');
}

// 7. wired: the picker is fed (the count rides the resolver input, stamped by the loop; the resolver's spawn
// state observes the frame), homes are published as dishPins (the loop writes them back when they move),
// and the count is the DIRECTORS row
{
  // #1694 slice 1 — the wiring moved: App's frame tap no longer calls observeSpawn; these pins follow it.
  const loop = readFileSync(new URL('../gl/liveLoop.mjs', import.meta.url), 'utf8');
  assert.ok(/creatureCount: s\.creatureCount/.test(loop), 'the loop stamps the count on the resolver input');
  assert.ok(/s\.setDishPins\(spawnNow\.dishPins\)/.test(loop), 'the loop publishes the homes as dishPins');
  const resolve = readFileSync(new URL('../gl/liveResolve.mjs', import.meta.url), 'utf8');
  assert.ok(/lastSpawnDecisions = spawnState\.observe\(input, out\)/.test(resolve), 'the resolver observes the frame');
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  assert.ok(!/observeSpawn\(input, output/.test(app), 'the tap channel is retired');
  const dav = readFileSync(new URL('../panels/DavisPanel.jsx', import.meta.url), 'utf8');
  assert.ok(/data-testid=\{`creatures-\$\{n\}`\}/.test(dav) && /\[0, 1, 2, 3, 4\]\.map/.test(dav), 'a 0 to 4 row in the DIRECTORS panel');
  assert.ok(/<PanelHeader tag="P07" title="DIRECTORS" subtitle=\{subtitle\}>[\s\S]*?creatures-\$\{n\}/.test(dav), 'in the panel HEADER, so the body keeps its height and its five section labels');
  assert.ok(!/davis-section-label ttl">creatures/.test(dav), 'no sixth section label');
  const src = readFileSync(new URL('./spawn.js', import.meta.url), 'utf8') + readFileSync(new URL('./spawnLive.js', import.meta.url), 'utf8');
  const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n');
  assert.ok(!/Date\.now|performance\.now|setTimeout|setInterval|Math\.random/.test(code), 'frames, not a clock; no chance');
  const doc = readFileSync(new URL('../state/projectDocument.js', import.meta.url), 'utf8');
  assert.ok(/doc\.creatureCount = creatures/.test(doc), 'the count is saved with the project (only when set)');
}

void DISH_RADIUS; void DISH_SATURATE;
console.log('spawn.selfcheck: ok (#1355 auto spawn)');
