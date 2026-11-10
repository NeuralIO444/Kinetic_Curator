// topbarTaste.selfcheck.mjs — the bar stays quiet unless a real signal says otherwise (#1122).
import assert from 'node:assert';
import {
  tasteLevel,
  verdictDetent,
  voiceBreathS,
  voiceLevel,
  VOICE_ACT_MS,
  litPills,
  TOPBAR_LIT_CAP,
  tasterReadout,
} from './topbarTaste.mjs';
import { voiceOptions, getActivePersonaId } from './taste.js';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};

ok('diamond is dark with no taste (rule 3: no signal, no shimmer)', () => {
  assert.equal(tasteLevel(null), 0);
  assert.equal(tasteLevel(undefined), 0);
  assert.equal(tasteLevel({}), 0);
});

ok('diamond is dark when fidelity is below the 0.3 bar', () => {
  assert.equal(tasteLevel({ head: { fidelity: 0.29 } }), 0);
  assert.equal(tasteLevel({ head: { fidelity: 0 } }), 0);
});

ok('diamond shimmers at 4 compressive levels once fidelity clears 0.3', () => {
  assert.equal(tasteLevel({ head: { fidelity: 0.3 } }), 1);
  assert.equal(tasteLevel({ head: { fidelity: 0.5 } }), 2);
  assert.equal(tasteLevel({ head: { fidelity: 0.75 } }), 3);
  assert.equal(tasteLevel({ head: { fidelity: 1.0 } }), 4);
  assert.equal(tasteLevel({ head: { fidelity: 0.99 } }), 4, 'capped at 4');
});

ok('CUR detent is 0 with no verdict parts', () => {
  assert.equal(verdictDetent(null), 0);
  assert.equal(verdictDetent(undefined), 0);
  assert.equal(verdictDetent({}), 0);
});

ok('CUR detent steps 0 / 2 / 4 on the real score', () => {
  assert.equal(verdictDetent({ score: 0.1 }), 0);
  assert.equal(verdictDetent({ score: 0.34 }), 0);
  assert.equal(verdictDetent({ score: 0.35 }), 2);
  assert.equal(verdictDetent({ score: 0.5 }), 2);
  assert.equal(verdictDetent({ score: 0.64 }), 2);
  assert.equal(verdictDetent({ score: 0.65 }), 4);
  assert.equal(verdictDetent({ score: 0.95 }), 4);
});

ok('voice breath is slower for calm personas, faster for drifty ones', () => {
  const calm = voiceBreathS(0);
  const mid = voiceBreathS(0.3);
  const wild = voiceBreathS(1);
  assert.ok(calm > mid && mid > wild, `${calm} > ${mid} > ${wild}`);
  assert.equal(voiceBreathS(undefined), voiceBreathS(0.25), 'no weight → neutral, never dark while active');
});

ok('V breathes only after a real roll and decays to still (rule 3)', () => {
  for (const none of [null, undefined, NaN, -1, 'x']) assert.equal(voiceLevel(none), 0, 'no roll: still');
  assert.equal(voiceLevel(0), 4);
  assert.equal(voiceLevel(VOICE_ACT_MS / 2), 2);
  assert.equal(voiceLevel(VOICE_ACT_MS - 1), 1);
  assert.equal(voiceLevel(VOICE_ACT_MS), 0, 'decayed: still again');
  let prev = 5;
  for (let ms = 0; ms < VOICE_ACT_MS; ms += 500) {
    const l = voiceLevel(ms);
    assert.ok(l <= prev);
    prev = l;
  }
});

ok('precedence caps lit pills: CUR > locks > KIN > V > L > diamond', () => {
  assert.equal(TOPBAR_LIT_CAP, 4);
  const all = litPills({ cur: true, locks: true, kin: true, voice: true, look: true, diamond: true });
  assert.deepEqual([...all], ['cur', 'locks', 'kin', 'voice'], 'look and diamond go subdued');
  const few = litPills({ cur: false, locks: true, kin: false, voice: true, look: false, diamond: false });
  assert.deepEqual([...few], ['locks', 'voice'], 'under the cap nothing dims');
});

ok('TASTE readout: the standing taster by id, DICE when off (#2050)', () => {
  assert.equal(tasterReadout('reas'), 'reas', 'the readout is the persona id, as the bar has always shown it');
  assert.equal(tasterReadout('lois'), 'lois');
  assert.equal(tasterReadout('davis'), 'davis');
  assert.equal(tasterReadout('off'), 'dice', 'off honestly means a uniform dice pick, and the label says so');
  assert.equal(tasterReadout(null), 'dice', 'no persona (taste.js null) reads DICE');
  assert.equal(tasterReadout(undefined), 'dice');
  assert.equal(tasterReadout(''), 'dice', 'never a blank readout');
  // Against the real option list: every selectable persona reads as itself,
  // and the word is never an alias or a real name (display policy).
  for (const p of voiceOptions()) {
    assert.equal(tasterReadout(p.id), p.id, `${p.id} reads as its id`);
    assert.notEqual(tasterReadout(p.id), p.alias, 'not the alias — the alias lives in the menu rows');
  }
  // The default standing (Davis) resolves through the same door the bar uses.
  assert.equal(tasterReadout(getActivePersonaId() ?? 'off'), getActivePersonaId() ?? 'dice');
});

console.log(`topbarTaste.selfcheck: ${n} checks passed`);
