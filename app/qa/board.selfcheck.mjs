// node qa/board.selfcheck.mjs — pure logic of the build board: status words,
// lane mapping, escaping. No gh calls here (those are integration, not unit).
import assert from 'node:assert';
import { classify, laneFor, isVisual, esc, age, renderBoard } from './board.mjs';

// --- classify: Matt's exact status words ------------------------------------

const green = [{ state: 'SUCCESS' }, { state: 'SUCCESS' }];
const clean = { mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' };

assert.deepStrictEqual(
  classify({ isDraft: false }, green, clean),
  { pill: 'CI green', section: 'ready' },
  'green + mergeable + not draft -> ready to merge');

assert.deepStrictEqual(
  classify({ isDraft: true }, green, clean).section, 'review',
  'green draft -> needs your review');

assert.deepStrictEqual(
  classify({ isDraft: false }, green, { mergeable: 'MERGEABLE', mergeStateStatus: 'BLOCKED' }).section,
  'working', 'green but merge blocked -> builder working, not ready');

assert.deepStrictEqual(
  classify({ isDraft: true }, [{ state: 'PENDING' }, { state: 'SUCCESS' }], clean),
  { pill: 'BLOCKED', section: 'working' },
  'checks still running -> BLOCKED');

assert.deepStrictEqual(
  classify({ isDraft: false }, [], clean),
  { pill: 'BLOCKED', section: 'working', note: 'no checks reported yet' },
  'no checks at all -> BLOCKED with a note');

assert.deepStrictEqual(
  classify({ isDraft: false }, [{ state: 'SUCCESS' }, { state: 'FAILURE' }], clean),
  { pill: 'CI red', section: 'attention' },
  'any failing check -> CI red, needs attention');

assert.deepStrictEqual(
  classify({ isDraft: false }, green, { mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }),
  { pill: 'CONFLICTING', section: 'attention' },
  'merge conflict beats green CI -> needs attention');

// --- lanes -------------------------------------------------------------------

const pr = (number, title, headRefName) => ({ number, title, headRefName });
assert.strictEqual(laneFor(pr(679, 'fix(behavior): shape transitions (#623)', 'fix/623-x'), {}), 'sleight-of-hand');
assert.strictEqual(laneFor(pr(671, 'feat(engine): lorenz-ride (#583)', 'feat/583-x'), {}), 'tropism');
assert.strictEqual(laneFor(pr(999, 'tooling: board', 'feat/build-board'), {}), 'other');
assert.strictEqual(laneFor(pr(999, 'tooling: board', 'feat/build-board'), { 999: 'tooling' }), 'tooling',
  'lanes.json override wins');
assert.ok(isVisual('sleight-of-hand') && !isVisual('backend'), 'visual vs backend split');

// --- rendering ----------------------------------------------------------------

assert.strictEqual(esc('<b>"x"&\'y\'</b>'), '&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;');
assert.strictEqual(age(new Date(Date.now() - 90 * 60000).toISOString()), '2h ago');
assert.strictEqual(age(new Date(Date.now() - 3 * 86400000).toISOString()), '3d ago');

const html = renderBoard([
  { number: 1, title: '<script>evil</script>', url: 'https://x', headRefName: 'b', lane: 'backend',
    visual: false, pill: 'CI green', section: 'ready', note: '', updatedAt: new Date().toISOString() },
]);
assert.ok(!html.includes('<script>evil</script>'), 'titles are escaped');
assert.ok(html.includes('Ready to merge'), 'sections render');
assert.ok(html.includes('— none —'), 'empty sections show a placeholder');

console.log('qa/board.selfcheck: OK');
