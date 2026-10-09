// node src/engine/kernel/version.selfcheck.mjs
// #1247 — KERNEL_VERSION bump gate.
//
// version.js KERNEL_VERSION is a manual string: nothing stops an engine change
// from moving the golden fixtures without bumping it. This suite pins a
// committed manifest (version.manifest.json): fixture name → sha256 of the
// deterministic fixture output, plus the KERNEL_VERSION those bytes were
// pinned at.
//
//   - fixtures match the manifest                    → pass (behaviour pinned)
//   - fixtures drift AND KERNEL_VERSION is unchanged  → FAIL with the message
//     below. Same commit must bump version.js AND refresh the manifest.
//   - fixtures drift AND KERNEL_VERSION moved         → pass with a warning:
//     intentional change, the manifest refresh is expected in that commit.
//
// Fixture inputs are duplicated here on purpose (not imported from
// goldenPlacement.selfcheck.mjs): they are an independent pin, so the gate
// recomputes from first principles. Canonicalisation matches
// fingerprintPlacements exactly — the two suites must hash the same bytes.
//
// Second, separate check (do not fold it into the fixture assert): the footer
// surfaces that must agree with version.js (App.jsx, HotkeyOverlay.jsx) import
// KERNEL_VERSION rather than hard-coding a kernel.vN literal.

import assert from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlacements } from '../buildPlacements.js';
import { KERNEL_VERSION } from './version.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = JSON.parse(readFileSync(join(HERE, 'version.manifest.json'), 'utf8'));

// ---- Fixture inputs (mirrors src/engine/goldenPlacement.selfcheck.mjs) ----
const ASSETS = [
  { id: 'a', weight: 'heavy' },
  { id: 'b', weight: 'medium' },
  { id: 'c', weight: 'light' },
];
const PALETTE = { swatches: ['#111', '#222', '#333', '#444'] };
const CAPS = {
  maxCount: 420,
  maxCountMirrored: 360,
  maxParticles: 200,
  allowMirror: true,
};
const LAYOUT_BASE = {
  composition: 'default',
  count: 40,
  scale: [0.4, 0.8],
  rotate: [0, 45],
  alpha: [60, 100],
  jitter: 10,
  density: 100,
  zTiers: 1,
  bleed: false,
  mirror: false,
  overlap: true,
  displacement: 0,
  noiseFreq: 0.005,
  noiseSpeed: 0.5,
};
const SEED = 0x1a4f;
const CANVAS_W = 1000;
const CANVAS_H = 700;

const FIXTURES = {
  'goldenPlacement.primary': {
    layoutParams: { ...LAYOUT_BASE, mode: 'grid' },
    seedOffsets: null,
  },
  'goldenPlacement.displacement': {
    layoutParams: { ...LAYOUT_BASE, mode: 'grid', displacement: 40 },
    seedOffsets: null,
  },
  'goldenPlacement.stratified': {
    layoutParams: { ...LAYOUT_BASE, mode: 'stratified' },
    seedOffsets: null,
  },
  'goldenPlacement.noiseOffset': {
    layoutParams: { ...LAYOUT_BASE, mode: 'grid', displacement: 40 },
    seedOffsets: { spatial: 0, color: 0, asset: 0, noise: 0xabcd },
  },
};

// Canonicalisation — must stay byte-identical to fingerprintPlacements in
// goldenPlacement.selfcheck.mjs.
function fingerprintPlacements(items, safeCount) {
  const canonical = items.map((it) => ({
    x: +Number(it.x).toFixed(4),
    y: +Number(it.y).toFixed(4),
    scale: +Number(it.scale).toFixed(4),
    rotation: +Number(it.rotation).toFixed(4),
    alpha: +Number(it.alpha).toFixed(4),
    assetId: it.assetId,
    color: it.color,
    key: it.key || null,
  }));
  const payload = JSON.stringify({ safeCount, n: items.length, items: canonical });
  return createHash('sha256').update(payload).digest('hex');
}

function recomputeFixture(name) {
  const fx = FIXTURES[name];
  assert.ok(fx, `manifest lists unknown fixture "${name}" — update FIXTURES in version.selfcheck.mjs`);
  const { items, safeCount } = buildPlacements({
    layoutParams: fx.layoutParams,
    seed: SEED,
    activeAssets: ASSETS,
    palette: PALETTE,
    caps: CAPS,
    canvasW: CANVAS_W,
    canvasH: CANVAS_H,
    seedOffsets: fx.seedOffsets,
  });
  assert.strictEqual(items.length, 40, `${name}: fixture must place 40 items`);
  return fingerprintPlacements(items, safeCount);
}

// ---- Check 1: fixture drift vs the pinned manifest ----
const pinnedVersion = MANIFEST.kernelVersion;
assert.ok(
  typeof pinnedVersion === 'string' && pinnedVersion.length > 0,
  'version.manifest.json must pin a kernelVersion string',
);
const drifted = [];
for (const [name, entry] of Object.entries(MANIFEST.fixtures ?? {})) {
  const actual = recomputeFixture(name);
  if (actual !== entry.sha256) drifted.push({ name, got: actual, pinned: entry.sha256 });
}

if (drifted.length > 0 && KERNEL_VERSION === pinnedVersion) {
  const lines = drifted.map(
    (d) => `  ${d.name}\n    pinned (${pinnedVersion}): ${d.pinned}\n    now:                  ${d.got}`,
  );
  assert.fail(
    `golden fixtures changed without KERNEL_VERSION bump — bump version.js or investigate\n` +
      lines.join('\n') +
      `\n` +
      `If the engine change is intentional: bump KERNEL_VERSION in src/engine/kernel/version.js` +
      ` and refresh the sha256 values in src/engine/kernel/version.manifest.json in the same commit.`,
  );
}
if (drifted.length > 0) {
  console.warn(
    `version.selfcheck: fixture drift accepted — KERNEL_VERSION moved ` +
      `(${pinnedVersion} → ${KERNEL_VERSION}). ` +
      `Refresh version.manifest.json kernelVersion + sha256 in this commit.`,
  );
}

// ---- Check 2: footer surfaces must agree with KERNEL_VERSION ----
const FOOTER_FILES = ['../../App.jsx', '../../components/HotkeyOverlay.jsx'];
for (const rel of FOOTER_FILES) {
  const src = readFileSync(join(HERE, rel), 'utf8');
  assert.ok(
    /import\s+\{\s*KERNEL_VERSION\s*\}\s+from\s+['"][^'"]*engine\/kernel\/version\.js['"]/.test(src),
    `${rel}: footer must import KERNEL_VERSION from engine/kernel/version.js (no bare or copied string)`,
  );
  assert.ok(
    /\{KERNEL_VERSION\}/.test(src),
    `${rel}: footer must render {KERNEL_VERSION}`,
  );
  assert.ok(
    !/kernel\.v\d+/.test(src),
    `${rel}: footer contains a hard-coded kernel version literal — it would drift from version.js`,
  );
}

console.log('version.selfcheck: OK', {
  fixtures: Object.keys(MANIFEST.fixtures ?? {}).length,
  drifted: drifted.length,
  kernelVersion: KERNEL_VERSION,
  pinnedAt: pinnedVersion,
});
