import assert from 'node:assert';
import { ingestSvg, duplicateAsset, overlayId } from './ingest.js';

const bad = ingestSvg('<svg><script>alert(1)</script></svg>');
assert.strictEqual(bad.ok, false);
assert.match(bad.error, /hostile/);

const ok = ingestSvg('<svg viewBox="0 0 512 512"><path d="M10 10 L20 20" fill="#e0245e"/></svg>', { id: 'blob' });
assert.strictEqual(ok.ok, true);
assert.strictEqual(ok.asset.id, 'user:blob');
assert.ok(ok.asset.svg.includes('var(--accent)'));
assert.ok(!ok.asset.svg.includes('#e0245e'));
assert.strictEqual(ok.asset.compound, false);

const two = ingestSvg('<g><circle cx="1" cy="1" r="1"/><path d="M0 0L1 1"/></g>');
assert.strictEqual(two.ok, true);
assert.strictEqual(two.asset.compound, true);

const dup = duplicateAsset({ id: 'org_blob', svg: '<path d="M0 0"/>', category: 'organic' });
assert.strictEqual(dup.asset.id, 'user:org_blob_2');
assert.notStrictEqual(dup.asset.id, 'org_blob');

assert.strictEqual(overlayId('org_bl_organic'), 'user:org_bl_organic');

console.log('ingest.selfcheck: OK');
