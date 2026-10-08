// loisFace.selfcheck.mjs — LOIS: NOD / VIBE / BURN / AWAY, from the honest feed only (#1126).
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { LOIS_FACES, resolveLoisFace } from './loisFace.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('four states, one fixed face each, exactly the design; LEAN and CRIT do not exist', () => {
  assert.deepEqual(Object.keys(LOIS_FACES), ['NOD', 'VIBE', 'BURN', 'AWAY']);
  assert.equal(LOIS_FACES.NOD.face, '( ̄—̄ )'); assert.equal(LOIS_FACES.VIBE.face, '( ─‿─ )');
  assert.equal(LOIS_FACES.BURN.face, '( ◉‿◉ )'); assert.equal(LOIS_FACES.AWAY.face, '( ── )');
  assert.ok(!LOIS_FACES.LEAN && !LOIS_FACES.CRIT);
  assert.equal(LOIS_FACES.NOD.label, 'now you are thinking with your own brains', 'the NOD line is unchanged');
});

ok('VIBE is the base while you are here; AWAY only when the feed says away', () => {
  assert.equal(resolveLoisFace().code, 'VIBE'); assert.equal(resolveLoisFace({}).code, 'VIBE');
  assert.equal(resolveLoisFace({ away: true }).code, 'AWAY');
});

ok('NOD while the kept frame is current; BURN on a streak; priority AWAY > NOD > BURN > VIBE', () => {
  assert.equal(resolveLoisFace({ frameKept: true }).code, 'NOD');
  assert.equal(resolveLoisFace({ burning: true }).code, 'BURN');
  assert.equal(resolveLoisFace({ frameKept: true, burning: true }).code, 'NOD', 'the kept frame in front of you outranks the streak behind you');
  assert.equal(resolveLoisFace({ away: true, frameKept: true, burning: true }).code, 'AWAY', 'five minutes gone: no longer news');
});

ok('the pill decides nothing: it polls the feed and paints, with no timers of its own opinion', () => {
  const src = readFileSync(new URL('../components/LoisPill.jsx', import.meta.url), 'utf8');
  assert.match(src, /resolveLoisFace\(loisActivity\.snapshot\(\)\)/);
  assert.ok(!/session|noteKeep|noteCurate|liftAt|keptAt|LEAN/.test(src), 'no private face state in the pill');
});

console.log(`loisFace.selfcheck: ${n} checks passed`);
