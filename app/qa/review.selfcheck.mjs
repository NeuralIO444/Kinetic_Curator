// node qa/review.selfcheck.mjs — the review cockpit's pure helpers stay honest.
import assert from 'node:assert';
import { extractChecklist, buildReviewHtml, esc } from './review.mjs';

// checklist extraction
const body = `# What this does\n\nSome prose.\n\n## Review this\n\n- [ ] first thing\n- [x] second thing\n- [ ] third <thing>\n\n## Localhost\n\nblah`;
const items = extractChecklist(body);
assert.strictEqual(items.length, 3, 'finds the three items under ## Review this');
assert.strictEqual(items[0].text, 'first thing');
assert.strictEqual(items[0].checked, false);
assert.strictEqual(items[1].checked, true);
assert.strictEqual(items[2].text, 'third <thing>');
assert.deepStrictEqual(extractChecklist('# no checklist here'), [], 'missing section -> empty');
assert.deepStrictEqual(extractChecklist('## Review this\n- [ ] only'), [{ text: 'only', checked: false }], 'section at EOF');

// numbered and plain-bullet lists (PR #682 uses "## Review this (Matt)" + numbers)
const items2 = extractChecklist('## Review this (Matt)\n\n1. first thing\n2) second thing\n- plain bullet\n\n## Localhost');
assert.strictEqual(items2.length, 3, 'numbered and bullet items');
assert.strictEqual(items2[0].text, 'first thing');
assert.ok(items2.every((i) => !i.checked), 'non-checkbox items start unchecked');

// page rendering escapes everything and inlines shots
const html = buildReviewHtml({
  n: '682', title: 'wash <mode>', url: 'https://example.com/pr/682', isDraft: true,
  branch: 'fix/x', worktree: '/tmp/wt', commit: 'abc123', localhost: 'http://127.0.0.1:5199/Kinetic_Curator/',
  ciRaw: 'lint-build-selfcheck\tpass\t40s', ciPass: true,
  selfcheck: { pass: true, summary: 'exit 0', tail: 'all <good>' },
  checklist: [{ text: 'look <here>', checked: false }],
  qa: { ran: true, pass: true, shotCount: 1, reportPath: '/tmp/qa-report/index.html' },
  shots: [{ caption: 's/01-a.png', b64: 'iVBORw0KGgo=' }],
  degraded: '',
});
assert.ok(!html.includes('<mode>') && !html.includes('<here>') && !html.includes('<good>'), 'everything escaped');
assert.match(html, /data:image\/png;base64,iVBORw0KGgo=/, 'screenshot inlined as data URI');
assert.match(html, /kc-review-682/, 'localStorage key is per-PR');
assert.match(html, /DRAFT/, 'draft badge shown');
assert.match(html, /lint-build-selfcheck\tpass\t40s/, 'exact CI output preserved');

const skipped = buildReviewHtml({
  n: '1', title: 't', url: 'u', isDraft: false, branch: 'b', worktree: 'w', commit: 'c',
  localhost: '', ciRaw: '', ciPass: false,
  selfcheck: { pass: false, summary: 'exit 1', tail: 'boom' },
  checklist: [], qa: { ran: false, pass: false, shotCount: 0, reportPath: '' }, shots: [], degraded: 'no chromium',
});
assert.match(skipped, /SKIPPED/, '--no-qa path renders');
assert.match(skipped, /No "Review this" checklist/, 'missing checklist renders');
assert.match(skipped, /no chromium/, 'degraded note renders');

console.log('qa/review.selfcheck: OK');
