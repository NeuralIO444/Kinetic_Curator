import assert from 'node:assert';
import { tickPhraseBeat } from './phraseTick.js';

const base = {
  phraseEnabled: true,
  phraseLength: 4,
  phraseBeat: 0,
  phraseOriginSeed: 10,
  seed: 10,
  phraseWrapGen: 0,
  phraseMode: 'reset-seed',
};

let s = { ...base };
s = { ...s, ...tickPhraseBeat(s) };
assert.strictEqual(s.phraseBeat, 1);
assert.ok(!s.phraseDidWrap);

s = { ...s, ...tickPhraseBeat({ ...s, phraseBeat: 3 }) };
assert.strictEqual(s.phraseBeat, 0);
assert.strictEqual(s.seed, 10);
assert.strictEqual(s.phraseDidWrap, true);

s = tickPhraseBeat({ ...base, phraseBeat: 3, phraseMode: 'cycle-seed' });
assert.strictEqual(s.seed, 11);
assert.strictEqual(s.phraseOriginSeed, 11);

let stepped = 0;
s = tickPhraseBeat(
  { ...base, phraseBeat: 3, phraseMode: 'step-ca', caGrid: { n: 1 } },
  { stepGrid: (g) => { stepped += 1; return { n: g.n + 1 }; } },
);
assert.strictEqual(s.seed, 10);
assert.strictEqual(s.caGrid.n, 2);
assert.strictEqual(stepped, 1);

assert.deepStrictEqual(tickPhraseBeat({ ...base, phraseEnabled: false }), {});

console.log('phraseTick.selfcheck: OK');
