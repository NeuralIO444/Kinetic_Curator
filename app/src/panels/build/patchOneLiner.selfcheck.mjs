// patchOneLiner.selfcheck — #1019 show rule: once, only with 2+ tracks,
// never nagging after seen or dismissed.
import { strict as assert } from 'node:assert';
import {
  PATCH_ONELINER_COPY,
  PATCH_ONELINER_SEEN_KEY,
  shouldShowPatchOneLiner,
  readPatchOneLinerSeen,
  writePatchOneLinerSeen,
} from './patchOneLiner.mjs';

const mem = () => {
  const bag = new Map();
  return {
    getItem: (k) => (bag.has(k) ? bag.get(k) : null),
    setItem: (k, v) => bag.set(k, String(v)),
  };
};

// Copy is one line, plain language, no jargon glyphs in the sentence body.
{
  assert.ok(PATCH_ONELINER_COPY.length > 0, 'copy non-empty');
  assert.ok(!PATCH_ONELINER_COPY.includes('\n'), 'copy is one line');
  assert.ok(/routes one track's motion into another/.test(PATCH_ONELINER_COPY), 'copy names the plain-language action');
  assert.ok(!/MOD|FIELD|FEED/.test(PATCH_ONELINER_COPY), 'copy leaves the jargon in the row above');
  console.log('[selfcheck] patchOneLiner copy');
}

// Rule table: shows only when 2+ tracks and never seen/dismissed.
{
  const cases = [
    [{ seen: false, dismissed: false, contentCount: 0 }, false, 'no tracks'],
    [{ seen: false, dismissed: false, contentCount: 1 }, false, 'one track — PATCH has nothing to point at'],
    [{ seen: false, dismissed: false, contentCount: 2 }, true, 'second track → shows once'],
    [{ seen: false, dismissed: false, contentCount: 4 }, true, 'more tracks → shows once'],
    [{ seen: true, dismissed: false, contentCount: 2 }, false, 'seen flag → never again'],
    [{ seen: false, dismissed: true, contentCount: 2 }, false, 'dismissed × → hidden this session'],
    [{ seen: false, dismissed: false, contentCount: 1.9 }, false, 'non-integer counts floor out'],
  ];
  for (const [input, want, label] of cases) {
    assert.strictEqual(shouldShowPatchOneLiner(input), want, label);
  }
  console.log('[selfcheck] patchOneLiner show rule');
}

// Storage round-trip: write persists, read honors, bad storage degrades.
{
  const s = mem();
  assert.strictEqual(readPatchOneLinerSeen(s), false, 'fresh → not seen');
  writePatchOneLinerSeen(s);
  assert.strictEqual(s.getItem(PATCH_ONELINER_SEEN_KEY), '1', 'flag written');
  assert.strictEqual(readPatchOneLinerSeen(s), true, 'readback → seen');
  assert.strictEqual(readPatchOneLinerSeen(undefined), false, 'missing storage → not seen, no throw');
  writePatchOneLinerSeen(undefined); // must not throw
  console.log('[selfcheck] patchOneLiner storage');
}
