// node src/panels/layout/topbarLegibility.selfcheck.mjs
//
// #2050 — top-bar legibility: the taster's name, KIN's next pass, armed ≠ live.
// Behavioural pins live with the resolvers (topbarTaste.selfcheck for the
// TASTE readout word; kineticHeat.selfcheck for the next-pass detent's
// single-source probe). This suite pins the SURFACES: the words the bar
// actually renders, the marks it actually draws, and the retirements — so a
// future edit cannot quietly re-collide VOICE, resurrect the post-hoc KIN
// label, or bring back the pin emoji.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const bar = read('./CuratorBar.jsx');
const kin = read('./KineticButton.jsx');
const heat = read('./kineticHeat.mjs');
const strip = read('../../components/ModeStrip.jsx');
const panelsCss = read('../../styles/panels.css');

// ── Item 1: the judge is labeled by its job ────────────────────────────────
ok('TASTE: the button, tooltip, aria and menu all name the job in the same words', () => {
  assert.match(bar, /tasterReadout\(voice\)/, 'the readout derives from the standing persona (taste.js state)');
  assert.match(bar, /Taste: \$\{taster\} — who tastes the CURATOR candidates/, 'aria names the job');
  assert.match(bar, /title="Taste — who tastes the CURATOR candidates/, 'tooltip names the job');
  assert.match(bar, /who tastes the curator candidates/, 'the menu header names the job');
  assert.match(bar, /full=\{`taste: \$\{tasterFull\} ▾`\}/, 'the open form is taste: <taster>');
  assert.match(bar, /taste: off — honest dice/, "the menu's off row keeps the honest thing");
  assert.match(bar, /taste: \{p\.title \|\| p\.alias\}/, 'persona rows are taste rows');
  assert.match(bar, /<span className="tb-micro">\{taster\}<\/span>/, 'the readout always stands (DICE when off)');
});

ok('TASTE: no state of the judge button carries VOI or VOICE any more', () => {
  for (const stale of [
    'Persona voice tasting',
    "short={voiceUsed ? 'voi' : 'v'}",
    'full={`voice:',
    '>voice: off',
    'voice: {p.title',
  ]) {
    assert.ok(!bar.includes(stale), `stale judge wording gone: ${stale}`);
  }
});

// ── Item 2: KIN's next pass, from the router itself ────────────────────────
ok('KIN detent: nextKineticLayer IS the router (structural single-source pin)', () => {
  const body = heat.slice(heat.indexOf('export function nextKineticLayer'));
  assert.match(
    body.slice(0, body.indexOf('\n}')),
    /return routeKineticTapHeat\(run, now, \{ chaos \}\)\.layer;/,
    'the detent delegates to routeKineticTapHeat — no parallel prediction to drift',
  );
});

ok('KIN detent: the button renders the next pass and retired the post-hoc label', () => {
  assert.match(
    kin,
    /nextKineticLayer\(runSnap, nowMs, \{ chaos: scopeChaos \}\)/,
    'derived from the standing run (state mirror), the detent clock and the scope gate',
  );
  assert.match(kin, /setRunSnap\(runRef\.current\)/, 'the mirror is written wherever the ref is');
  assert.match(kin, /className="tb-micro kin-next" data-next=\{nextLayer\}/, 'the detent stands on the button');
  assert.match(kin, /kineticNextLabel\(nextLayer\)/, 'the detent word comes from the router module');
  assert.ok(!kin.includes('lastLayer'), 'the last-pass state is gone');
  assert.ok(!kin.includes('last tap ran'), 'the post-hoc label is retired');
  // The tap path itself is untouched: same router call, same four passes.
  assert.match(kin, /routeKineticTapHeat\(runRef\.current, now, \{ chaos: scopeChaos \}\)/);
  for (const pass of ['kineticLookPass()', 'kineticVoicePass()', 'kineticCuratorPass()', 'kineticRoll()']) {
    assert.ok(kin.includes(pass), `the tap still fires ${pass}`);
  }
});

// ── Item 3: armed ≠ live — the corner detent ───────────────────────────────
ok('chips: the armed mark is a corner detent on both rows, read off the store arm state', () => {
  assert.equal((strip.match(/className="chip-detent"/g) || []).length, 2, 'one detent render per row (mode + motion)');
  assert.match(strip, /useStore\(\(s\) => s\.armedMode\)/, 'mode detent ⇔ armedMode in the store');
  assert.match(strip, /useStore\(\(s\) => s\.armedMotion\)/, 'motion detent ⇔ armedMotion in the store');
  assert.ok(!strip.includes('📌'), 'the pin emoji is gone');
  assert.ok(!strip.includes('pin-glyph'), 'the pin glyph class is gone');
});

ok('chips: the detent CSS is a corner tick in the one red, scoped to the strip', () => {
  assert.match(panelsCss, /\.mode-strip \.chip-btn \{\s*position: relative;/, 'strip chips anchor the detent');
  assert.match(
    panelsCss,
    /\.chip-detent \{[^}]*border-top: 5px solid var\(--kc-red\);[^}]*border-left: 5px solid transparent;/,
    'a corner tick: red top edge, transparent side',
  );
  assert.ok(!panelsCss.includes('.pin-glyph'), 'the old pin rule is gone');
  assert.ok(!/\.chip-btn\.armed \{\s*outline/.test(panelsCss), 'the Davis outline no longer renders the boolean');
});

console.log(`topbarLegibility.selfcheck: ${n} checks passed`);
