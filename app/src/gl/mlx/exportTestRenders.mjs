/**
 * Test-render export — MLX harness intelligence (backend hardening 6/6),
 * harness-side DATA EXPORT.
 *
 * The harness renders its test frames (the same scenes the parity harness
 * and golden tests use); the Mac Studio embeds those PNGs with MLX SigLIP to
 * produce the committed golden embeddings. This module writes the manifest
 * that travels with the PNGs: effect, shader, params, file name, sha256,
 * and size per render — so the Mac Studio can verify it embedded exactly
 * the renders the harness produced.
 *
 * NODE-ONLY (needs fs + crypto for hashing). The harness's node side runs
 * this after the browser side writes the PNGs. The schemas and writers in
 * the sibling modules stay browser-safe; only this one touches the disk.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { schemaId, SCHEMAS } from './schemas.mjs';

function fail(field, why) {
  throw new Error(`[mlx:renders] invalid manifest — ${field}: ${why}`);
}

/** sha256 of a file, hex. */
export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * One manifest entry for a rendered PNG.
 * @param {object} o { effect, shader, params, pngPath, pngDir }
 */
export function renderEntry({ effect, shader, params = {}, pngPath, pngDir }) {
  if (typeof effect !== 'string' || !effect) fail('effect', 'non-empty string required');
  if (typeof shader !== 'string' || !shader) fail('shader', 'non-empty string required');
  const hash = sha256File(pngPath);
  return {
    effect,
    shader,
    params,
    png: pngDir ? basename(pngPath) : pngPath,
    sha256: hash,
    bytes: readFileSync(pngPath).length,
  };
}

/**
 * Validate a test-render manifest object.
 */
export function validateManifest(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) fail('manifest', 'must be an object');
  if (m.schema !== schemaId('testRenderManifest')) fail('schema', `must be ${schemaId('testRenderManifest')}`);
  if (typeof m.generated_at !== 'string' || Number.isNaN(Date.parse(m.generated_at))) fail('generated_at', 'ISO-8601 required');
  if (typeof m.harness_commit !== 'string') fail('harness_commit', 'string required');
  if (typeof m.png_dir !== 'string') fail('png_dir', 'string required');
  if (!Array.isArray(m.renders) || !m.renders.length) fail('renders', 'must be a non-empty array');
  for (const [i, r] of m.renders.entries()) {
    for (const f of ['effect', 'shader', 'png', 'sha256']) {
      if (typeof r[f] !== 'string' || !r[f]) fail(`renders[${i}].${f}`, 'non-empty string required');
    }
    if (!/^[0-9a-f]{64}$/.test(r.sha256)) fail(`renders[${i}].sha256`, 'must be a 64-char hex sha256');
  }
  return m;
}

/**
 * Write the manifest for a directory of harness test-render PNGs.
 *
 * @param {object} o
 * @param {string} o.pngDir    directory holding the PNGs
 * @param {Array}  o.renders   entries built by renderEntry() (png names relative to pngDir)
 * @param {string} o.outPath   where to write the manifest JSON
 * @param {string} [o.commit]  harness git sha
 */
export function writeTestRenderManifest({ pngDir, renders, outPath, commit = 'unknown' }) {
  const manifest = validateManifest({
    schema: schemaId('testRenderManifest'),
    generated_at: new Date().toISOString(),
    harness_commit: commit,
    png_dir: basename(pngDir),
    renders: renders.map((r) => ({ ...r, png: basename(r.png) })),
  });
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
  return { outPath, count: renders.length };
}

export const FIELDS = SCHEMAS.testRenderManifest.fields;
