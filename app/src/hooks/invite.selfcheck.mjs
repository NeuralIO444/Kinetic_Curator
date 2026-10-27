// invite.selfcheck.mjs — the shimmer that invites a press, and the cool-down it shares a row with (#1103).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { INVITE_IDLE_MS, inviteActive, createInvites } from './invite.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('it shimmers until pressed, is quiet while in use, and comes back after a minute without a press', () => {
  assert.equal(INVITE_IDLE_MS, 60_000);
  assert.equal(inviteActive(null, 5), true); assert.equal(inviteActive(undefined, 5), true); assert.equal(inviteActive(NaN, 5), true);
  assert.equal(inviteActive(1000, 1000), false, 'quiet the instant it is pressed');
  assert.equal(inviteActive(1000, 1000 + INVITE_IDLE_MS - 1), false);
  assert.equal(inviteActive(1000, 1000 + INVITE_IDLE_MS), true, 'back at exactly a minute');
});

ok('the store: use() quiets it, a second press restarts the minute, subscribers hear both the quiet and the return', () => {
  let t = 0; const timers = [];
  const inv = createInvites({ now: () => t, setTimer: (fn, ms) => { const h = { fn, at: t + ms }; timers.push(h); return h; }, clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); } });
  const advance = (ms) => { t += ms; for (const h of [...timers]) if (h.at <= t) { timers.splice(timers.indexOf(h), 1); h.fn(); } };
  let heard = 0; const off = inv.subscribe(() => { heard += 1; });
  assert.equal(inv.active('kinetic'), true);
  inv.use('kinetic');
  assert.equal(inv.active('kinetic'), false); assert.equal(heard, 1);
  assert.equal(inv.active('curator'), true, 'each button has its own invitation');
  advance(40_000); inv.use('kinetic');                 // pressed again at 40 s: the minute restarts
  advance(40_000); assert.equal(inv.active('kinetic'), false, 'still quiet at 80 s');
  advance(20_000); assert.equal(inv.active('kinetic'), true, 'back 60 s after the LAST press');
  assert.ok(heard >= 3, 'the return is announced (so the sheen starts again)');
  off();
});

ok('KINETIC and CURATOR carry the sheen, nothing else does; a press quiets it', () => {
  const kin = read('../panels/layout/KineticButton.jsx'); const bar = read('../panels/layout/CuratorBar.jsx');
  assert.match(kin, /useInvite\('kinetic'\)/); assert.match(kin, /xl-shimmer/); assert.match(kin, /markUsed\(\);/);
  assert.match(bar, /useInvite\('curator'\)/); assert.match(bar, /xl-shimmer/);
  assert.equal((bar.match(/xl-shimmer/g) || []).length, 1, 'only CURATOR in the Curator bar: not L, V or BEAT');
  assert.ok(!/xl-shimmer/.test(read('../components/BeatButton.jsx')));
});

ok('the sheen is the AUDIO button\'s, and it goes quiet in use, with reduced motion, and on the stage', () => {
  const css = read('../styles/controls.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.xl-shimmer::after \{[^}]*animation: stim-shimmer 3\.2s ease-in-out infinite/);
  const quiet = css.match(/\.xl-shimmer:hover::after[^{]*\{[^}]*\}/)[0];
  for (const sel of [':focus-visible', '.open', '[data-open="true"]', '[data-heat-level="warm"]', '[data-heat-level="hot"]']) assert.ok(quiet.includes(`.xl-shimmer${sel}::after`), `quiet on ${sel}`);
  assert.match(css, /\.app-fullscreen \.xl-shimmer::after \{ display: none; \}/);
  assert.match(css, /prefers-reduced-motion: reduce\) \{[\s\S]*?\.xl-shimmer::after \{ display: none; \}/);
  assert.match(read('../styles/panels.css'), /@keyframes stim-shimmer/, 'the keyframes are the existing ones');
});

ok('the cool-down: letters retreat last-first and arrive first-first, eased out; the swap form glides; KIN\'s width is continuous', () => {
  const css = read('../styles/controls.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.xl-ch \{[^}]*calc\(\(var\(--n\) - 1 - var\(--i\)\) \* 40ms\)/, 'cooling: reverse order, 40 ms apart');
  assert.match(css, /transition: max-width 120ms ease calc\(var\(--i\) \* 22ms\)/, 'opening: forward order, quick');
  assert.match(css, /\.xl-swap \{[^}]*width 420ms cubic-bezier/, 'cooling is slow and eased out');
  assert.match(css, /transition-duration: 180ms/, 'expanding is quick');
  assert.match(css, /\.kinetic-btn\[data-cooling="true"\] \{[^}]*min-width 160ms linear/s, 'the heat width glides between the 150 ms ticks, while cooling');
  assert.ok(!/\.kinetic-btn \{[^}]*min-width 160ms/s.test(css), 'heating stays instant: the glide is only for cooling');
  for (const r of css.match(/\.xl-ch[^{]*\{[^}]*\}/g)) assert.ok(!/\d+px/.test(r), 'a width is a count, not pixels');
  const lbl = read('../components/ExpandLabel.jsx');
  assert.match(lbl, /className="xl-ch" style=\{\{ '--i': i, '--n': p\.tail\.length \}\}/);
});

console.log(`invite.selfcheck: ${n} checks passed`);
