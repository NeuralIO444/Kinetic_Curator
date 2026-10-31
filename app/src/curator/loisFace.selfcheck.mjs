// loisFace.selfcheck.mjs — LOIS: NOD / VIBE / BURN / AWAY, from the honest feed only (#1126);
// CUT joins the table at #1856 (BOOK S3): the round earns the word a face. Re-pin cause: issue
// #1856 scope item 2 — CUT is a rendered face now, not only a word in the Mind reply contract.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { LOIS_FACES, resolveLoisFace } from './loisFace.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

ok('five states, one fixed face each, exactly the design; LEAN and CRIT do not exist', () => {
  assert.deepEqual(Object.keys(LOIS_FACES), ['NOD', 'VIBE', 'BURN', 'AWAY', 'CUT']);
  assert.equal(LOIS_FACES.NOD.face, '( ̄—̄ )');
  assert.equal(LOIS_FACES.VIBE.face, '( ─‿─ )');
  assert.equal(LOIS_FACES.BURN.face, '( ◉‿◉ )');
  assert.equal(LOIS_FACES.AWAY.face, '( ── )');
  assert.ok(!LOIS_FACES.LEAN && !LOIS_FACES.CRIT);
  assert.equal(LOIS_FACES.NOD.label, 'now you are thinking with your own brains', 'the NOD line is unchanged');
});

ok('CUT: the severed line, his red, his sentence (#1856)', () => {
  assert.equal(LOIS_FACES.CUT.face, '( ─|─ )', 'the flat eyes of VIBE/AWAY, cut at the middle');
  assert.equal(LOIS_FACES.CUT.tone, 'red', "LOIS's own red (--kc-red), no other face wears it");
  assert.equal(LOIS_FACES.CUT.label, 'Cut. That one does not stand.');
  assert.equal(resolveLoisFace({ cut: true }).code, 'CUT');
  assert.equal(
    resolveLoisFace({ cut: true, frameKept: true, burning: true }).code,
    'CUT',
    'the cut he just spent is the news; the kept frame waits',
  );
  assert.equal(
    resolveLoisFace({ away: true, cut: true }).code,
    'AWAY',
    'gone five minutes: even a cut is no longer news (silence is default)',
  );
  // the feed as it exists today has no cut flag: the four states resolve exactly as before
  assert.equal(resolveLoisFace({ away: false, burning: false, frameKept: false }).code, 'VIBE');
  assert.equal(resolveLoisFace({ frameKept: true }).code, 'NOD');
});

ok('VIBE is the base while you are here; AWAY only when the feed says away', () => {
  assert.equal(resolveLoisFace().code, 'VIBE');
  assert.equal(resolveLoisFace({}).code, 'VIBE');
  assert.equal(resolveLoisFace({ away: true }).code, 'AWAY');
});

ok('NOD while the kept frame is current; BURN on a streak; priority AWAY > CUT > NOD > BURN > VIBE', () => {
  assert.equal(resolveLoisFace({ frameKept: true }).code, 'NOD');
  assert.equal(resolveLoisFace({ burning: true }).code, 'BURN');
  assert.equal(
    resolveLoisFace({ frameKept: true, burning: true }).code,
    'NOD',
    'the kept frame in front of you outranks the streak behind you',
  );
  assert.equal(
    resolveLoisFace({ away: true, frameKept: true, burning: true }).code,
    'AWAY',
    'five minutes gone: no longer news',
  );
});

ok('the pill decides nothing: it polls the feed and paints, with no timers of its own opinion', () => {
  const src = readFileSync(new URL('../components/LoisPill.jsx', import.meta.url), 'utf8');
  assert.match(src, /resolveLoisFace\(loisActivity\.snapshot\(\)\)/);
  assert.ok(!/session|noteKeep|noteCurate|liftAt|keptAt|LEAN/.test(src), 'no private face state in the pill');
});

console.log(`loisFace.selfcheck: ${n} checks passed`);
