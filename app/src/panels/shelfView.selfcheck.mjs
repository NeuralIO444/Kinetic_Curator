// shelfView.selfcheck.mjs — K5, the shelf revision: one shelf at two
// sizes, and the UX pass's hierarchy, pinned. Node-only: behaviour of
// the pure view model (panels/shelfView.mjs) plus source invariants on
// the component and its CSS (the render itself is Matt's localhost
// lane, per the house pattern — cf. chiaroscuro.selfcheck).
//   · the view model: the stage is always 16 cells (ghosts included),
//     identity carries no seed, the seed is a 4-digit caption segment,
//     location is a tag (never meta prose), dead rows state a reason,
//     the aim sentence replaces the table line verbatim, the tools
//     stand down on an empty collection, the overlay anchor refuses
//     a too-small canvas wrap
//   · the component: ONE state source (one aim, one query, one sort,
//     one expanded), rows markup exists exactly once and only inside
//     the portaled expanded panel (the mini renders no rows), the
//     floating-editor seams (portal + canvas anchor + Esc, no modal
//     machinery, no backdrop), the honest lines word for word
//   · the CSS: the 16-cell grid, §2.3 inversion for sort + aimed slot,
//     no amber anywhere on the surface, staged rows no longer dimmed
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), 'utf8');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

const vm = await import('./shelfView.mjs');
const view = read('./ShelfView.jsx');
const css = read('../styles/panels.css');
const shelfCss = css.slice(css.indexOf('/* #1589 — the keeps shelf'), css.indexOf('.cand-grid'));

const keep = (id, extra = {}) => ({
  id,
  config: { layout: { mode: 'stratified' }, palette: { id: 'persona-mohr' } },
  ...extra,
});

ok('the stage is always 16 cells — staged keeps in order, ghosts behind them', () => {
  const hand = keep('k-hand');
  const mined = keep('k-mined', { provenance: { source: 'explorer' } });
  const deck = keep('k-deck');
  const cells = vm.stageCells([hand, mined, deck], 'k-deck');
  assert.equal(cells.length, 16);
  assert.deepEqual(cells.slice(0, 3).map((c) => c.keepId), ['k-hand', 'k-mined', 'k-deck']);
  assert.equal(cells[0].label, 'stratified · persona-mohr');
  assert.deepEqual(cells[1].marks, ['mined ×2']);
  assert.equal(cells[2].onDeck, true);
  assert.deepEqual(cells[2].marks, ['on deck']);
  assert.ok(cells.slice(3).every((c) => c.keepId === null && c.label === ''));
  assert.ok(vm.stageCells([], null).every((c) => c.keepId === null), 'an empty stage is 16 ghosts');
});

ok('identity carries no seed; the seed is a four-digit caption segment', () => {
  const row = {
    label: 'stratified · persona-mohr · seed 2094644946',
    keep: { seed: 2094644946 },
    families: ['geometric'], origin: '', keptAt: null, stagedCount: null,
  };
  assert.equal(vm.rowIdentity(row), 'stratified · persona-mohr');
  assert.equal(vm.rowSeedSegment(row), 'seed …4946');
  const meta = vm.rowMeta(row);
  assert.equal(meta[0], 'seed …4946', 'the seed leads the caption, per the pass');
  assert.ok(meta.includes('kept (legacy)') && meta.includes('never staged'));
  const mined = { label: 'geometric cast · persona-mohr palette · far corner', keep: { seed: 7 }, families: [], keptAt: 1, stagedCount: 2 };
  assert.equal(vm.rowIdentity(mined), mined.label, 'a label with no seed segment passes through word for word');
});

ok('location is a right-edge tag, never prose in the caption', () => {
  const base = { label: 'x', keep: { seed: 1 }, families: [], keptAt: 1, stagedCount: 0 };
  assert.equal(vm.rowLocationTag({ ...base, tier: 'stage', location: 'app' }), 'on stage');
  assert.equal(vm.rowLocationTag({ ...base, tier: 'collection', location: 'disk' }), 'on disk');
  assert.equal(vm.rowLocationTag({ ...base, tier: 'collection', location: 'disk-away' }), 'disk away');
  assert.equal(vm.rowLocationTag({ ...base, tier: 'collection', location: 'missing' }), 'file gone');
  assert.equal(vm.rowLocationTag({ ...base, tier: 'collection', location: 'app' }), null);
  const meta = vm.rowMeta({ ...base, tier: 'collection', location: 'disk' }).join(' · ');
  assert.ok(!meta.includes('on disk'), 'the caption carries no location prose');
});

ok('a row whose record is not in hand says why, in the row', () => {
  const stub = { label: 'x', keep: null, families: [], keptAt: null, stagedCount: null };
  assert.equal(vm.rowReason({ ...stub, location: 'disk-away' }), 'connect the loot folder to bring it back');
  assert.equal(vm.rowReason({ ...stub, location: 'missing' }), 'file gone from the loot folder');
  assert.equal(vm.rowReason({ label: 'x', keep: { seed: 1 }, location: 'disk', families: [], keptAt: 1, stagedCount: 0 }), null,
    'a disk keep whose record was read acts normally — no reason');
});

ok('the aim sentence replaces the table line, word for word', () => {
  const aimed = vm.fillBandState({ aimedSlot: 5, tableLine: 'table: FULL WEIRD · shipped defaults' });
  assert.equal(aimed.kind, 'aim');
  assert.equal(aimed.text, 'slot 6 aimed — pick a shelf keep to swap in');
  const idle = vm.fillBandState({ aimedSlot: null, tableLine: 'table: FULL WEIRD · shipped defaults' });
  assert.deepEqual(idle, { kind: 'table', text: 'table: FULL WEIRD · shipped defaults' });
});

ok('the tools stand down on an empty collection, and the anchor refuses a tiny wrap', () => {
  assert.equal(vm.toolsStandDown(0), true);
  assert.equal(vm.toolsStandDown(1), false);
  assert.deepEqual(
    vm.shelfAnchor({ top: 100, left: 50, width: 1000, height: 700 }),
    { top: 116, left: 66, width: 968, height: 668 },
  );
  assert.equal(vm.shelfAnchor({ top: 0, left: 0, width: 79, height: 700 }), null);
  assert.equal(vm.shelfAnchor(null), null);
});

ok('one component, one state source — aim, query, sort, size each exist exactly once', () => {
  for (const name of ['aimedSlot', 'query', 'sort', 'expanded']) {
    const defs = view.match(new RegExp(`const \\[${name},`, 'g')) || [];
    assert.equal(defs.length, 1, `${name} is a single useState`);
  }
  assert.equal((view.match(/className="shelf-stage"/g) || []).length, 1, 'the stage grid is defined once, rendered by both sizes');
  assert.equal((view.match(/className="shelf-fillrow"/g) || []).length, 1, 'the fill band is defined once');
  assert.equal((view.match(/className="shelf-controls"/g) || []).length, 1, 'the tools are defined once');
});

ok('the mini renders no collection rows — the rows live only inside the expanded panel', () => {
  assert.equal((view.match(/className="shelf-rows"/g) || []).length, 1, 'rows markup exists exactly once');
  assert.ok(view.indexOf('{rowsList}') > view.indexOf('shelf-overlay'), 'rows render inside the portaled overlay, after it opens');
  assert.ok(view.indexOf('{rowsList}') === view.lastIndexOf('{rowsList}'), 'rows render in exactly one place');
  assert.ok(!view.includes('aria-modal'), 'no focus-trap modal semantics');
  assert.ok(!/className=\{?["'`][^"'`]*backdrop/.test(view), 'no backdrop element is rendered');
});

ok('the expanded panel rides the shipped floating-editor seams', () => {
  assert.ok(view.includes('createPortal'), 'portaled to the body');
  assert.ok(view.includes("querySelector('.canvas-wrap')"), 'anchored to the canvas wrap');
  assert.ok(view.includes("'Escape'"), 'Esc closes');
  assert.ok(view.includes('aria-haspopup="dialog"'), 'the expand control declares the dialog');
  assert.ok(view.includes('shelfAnchor'), 'the anchor math is the pure seam, shared with this suite');
});

ok('the honest lines survive word for word', () => {
  assert.ok(view.includes('tier is membership, not a copy — a keep lives once: on the stage, in the collection, or on disk'), 'the motto');
  assert.ok(view.includes('the stage is empty — crown something'), 'the empty-stage line');
  assert.ok(view.includes('nothing on the shelf matches'), 'the no-match line');
  assert.ok(view.includes('KINETIC — deal a new stage'), 'the fill button');
  assert.ok(view.includes('on the deck — this slot refuses swaps'), 'the deck refusal');
  assert.ok(view.includes('search the collection — family, palette, origin, seed'), 'the search placeholder');
});

ok('the CSS: grid, one inversion grammar, no amber, staged rows at full strength', () => {
  assert.ok(shelfCss.includes('grid-template-columns: repeat(8, 1fr)'), 'the stage is a fixed 8×2 grid');
  const sortActive = shelfCss.slice(shelfCss.indexOf('.shelf-sort.active'), shelfCss.indexOf('.shelf-sort.active') + 120);
  assert.ok(sortActive.includes('background: var(--ink)'), 'the active sort is the §2.3 inversion');
  const slotAimed = shelfCss.slice(shelfCss.indexOf('.shelf-slot.aimed'), shelfCss.indexOf('.shelf-slot.aimed') + 120);
  assert.ok(slotAimed.includes('background: var(--ink)'), 'the aimed slot is the same inversion');
  assert.ok(!shelfCss.includes('kc-amber'), 'amber appears nowhere on the surface');
  assert.ok(!/\.shelf-row\.is-stage\s*\{[^}]*opacity/.test(shelfCss), 'staged rows are not dimmed');
  assert.ok(shelfCss.includes('.shelf-row-label { font-size: 11px'), 'row identity is DS body size');
  const overlay = shelfCss.slice(shelfCss.indexOf('.shelf-overlay {'), shelfCss.indexOf('.shelf-overlay {') + 200);
  assert.ok(overlay.includes('position: fixed') && overlay.includes('z-index: 60'), 'the overlay floats with the editor grammar');
});

console.log(`shelfView.selfcheck: PASS (${n} groups)`);
