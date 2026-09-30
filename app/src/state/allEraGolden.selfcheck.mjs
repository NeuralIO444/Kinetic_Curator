// node src/state/allEraGolden.selfcheck.mjs
// #519 — pre-map 'all'-era project golden.
// An all-era project (enabledAssets: 'all') must load after the flagship
// maps landed and render its first frame byte-identically. The fixture is
// the checked-in all-era doc; the hash pins its first render. Update the
// EXPECTED hash only when the render pipeline intentionally changes.
import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseProject } from './projectDocument.js';
import { renderSvg } from '../../../studio/render.mjs';
import { ASSETS } from '../data/assets/index.js';

/** First-render SVG SHA-256 of the all-era fixture — bump only on intentional render changes. */
export const EXPECTED_ALL_ERA_FIRST_RENDER_HASH =
  '90ae4f2ee5473d9cd8a2b07f4cc948e512d6941363377e9883e99946a72ed666';

const raw = JSON.parse(readFileSync(new URL('./fixtures/all-era-project.json', import.meta.url), 'utf8'));

// The all-era doc loads.
const parsed = parseProject(raw);
assert.ok(parsed.ok, 'all-era project must parse');
// 'all' normalizes to null → the full catalog renders, not a 4-map set.
assert.strictEqual(parsed.doc.enabledAssets, null, "'all' must resolve to the full catalog");

// First render is deterministic and matches the pinned hash.
const first = renderSvg(parsed.doc, { time: 0 });
const second = renderSvg(parsed.doc, { time: 0 });
assert.strictEqual(first, second, 'first render must be deterministic');
assert.ok(first.length > 10000, 'first render is non-trivial');
const hash = createHash('sha256').update(first).digest('hex');
assert.strictEqual(hash, EXPECTED_ALL_ERA_FIRST_RENDER_HASH, 'all-era first-render hash');

// Sanity: the render really ran in the 'all' era — the pool is the full
// registry, not the flagship 4-map sets.
assert.ok(ASSETS.length > 200, `catalog holds the full registry (got ${ASSETS.length})`);
console.log(`all-era golden ok (${ASSETS.length} assets, ${first.length} svg bytes)`);
