#!/usr/bin/env node
/**
 * check_semantic_goldens — CI gate, MLX harness intelligence (backend hardening 6/6).
 *
 * "Does this still read as the same artwork?" The harness renders its test
 * frames; MLX SigLIP embeds them on the Mac Studio; the golden embeddings are
 * committed to mlx_artifacts/. This script compares the committed golden
 * embeddings against the committed CURRENT embeddings with pure cosine
 * similarity — no GPU, no MLX, pure math, so it runs in CI.
 *
 * THE HONEST BOUNDARY: the embeddings only exist after Matt runs the Mac
 * Studio runbook (docs/MLX_HARNESS_RUNBOOK.md). If the artifacts are absent,
 * this check LOUD-SKIPS (exit 0, unmissable banner) — it never fails closed
 * on missing artifacts, and this script never invents embeddings.
 *
 * Wired into `npm run selfcheck`, which is what CI runs.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = join(HERE, '..', '..', 'mlx_artifacts');
const GOLDEN = join(ARTIFACTS, 'golden_embeddings.json');
const CURRENT = join(ARTIFACTS, 'current_embeddings.json');
const EXPECTED_SCHEMA = 'kc-golden-embeddings/1';

export function skipBanner() {
  return [
    '',
    '╔══════════════════════════════════════════════════════════════════════╗',
    '║  check_semantic_goldens: SKIPPED — no MLX artifacts committed yet     ║',
    '║                                                                      ║',
    '║  This check needs mlx_artifacts/golden_embeddings.json, which only   ║',
    '║  exists after the Mac Studio runbook runs (MLX = Apple Silicon).    ║',
    '║  See docs/MLX_HARNESS_RUNBOOK.md §2. This is a SKIP, not a pass —   ║',
    '║  the semantic golden gate arms itself the day the artifacts land.   ║',
    '╚══════════════════════════════════════════════════════════════════════╝',
    '',
  ].join('\n');
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function loadJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`[semantic-goldens] FAIL — could not read ${label} at ${path}: ${e.message}`);
    process.exit(1);
  }
}

function main() {
  if (!existsSync(GOLDEN) || !existsSync(CURRENT)) {
    console.log(skipBanner());
    process.exit(0);
  }

  const golden = loadJson(GOLDEN, 'golden');
  const current = loadJson(CURRENT, 'current');

  // Schema + model identity — a model change is NEVER silently mixed.
  // (The curator's 768 -> 1152 lesson, enforced in CI.)
  for (const [label, doc] of [['golden', golden], ['current', current]]) {
    if (doc.schema !== EXPECTED_SCHEMA) {
      console.error(`[semantic-goldens] FAIL — ${label} schema is "${doc.schema}", expected "${EXPECTED_SCHEMA}"`);
      process.exit(1);
    }
    if (!doc.model || typeof doc.model.id !== 'string' || !Number.isInteger(doc.model.dims)) {
      console.error(`[semantic-goldens] FAIL — ${label} has no model { id, dims } — cannot verify embedding identity`);
      process.exit(1);
    }
  }
  if (golden.model.id !== current.model.id || golden.model.dims !== current.model.dims) {
    console.error(
      `[semantic-goldens] FAIL — embedding model mismatch: golden is ${golden.model.id} ` +
      `(${golden.model.dims}d), current is ${current.model.id} (${current.model.dims}d). ` +
      `RE-EMBED REQUIRED — re-run docs/MLX_HARNESS_RUNBOOK.md §2, do not mix models.`,
    );
    process.exit(1);
  }

  const kinds = Object.keys(golden.effects || {});
  if (!kinds.length) {
    console.error('[semantic-goldens] FAIL — golden embeddings contain no effects');
    process.exit(1);
  }

  const failures = [];
  const rows = [];
  for (const kind of kinds) {
    const g = golden.effects[kind];
    const c = current.effects?.[kind];
    if (!c) {
      failures.push({ kind, reason: 'missing from current_embeddings.json' });
      continue;
    }
    if (!Array.isArray(g.embedding) || !Array.isArray(c.embedding)) {
      failures.push({ kind, reason: 'embedding is not an array' });
      continue;
    }
    if (g.embedding.length !== golden.model.dims || c.embedding.length !== golden.model.dims) {
      failures.push({ kind, reason: `embedding dims ${g.embedding.length}/${c.embedding.length} != model dims ${golden.model.dims} — re-embed required` });
      continue;
    }
    const sim = cosine(g.embedding, c.embedding);
    const threshold = Number.isFinite(g.threshold) ? g.threshold : (golden.default_threshold ?? 0.985);
    rows.push({ kind, sim, threshold });
    if (sim < threshold) failures.push({ kind, sim, threshold });
  }

  for (const r of rows) {
    console.log(`  ${r.kind}: cosine=${r.sim.toFixed(4)} (threshold ${r.threshold})`);
  }

  if (failures.length) {
    console.error('');
    console.error('[semantic-goldens] FAIL — the following effects no longer read as the same artwork:');
    for (const f of failures) {
      if (f.sim != null) {
        console.error(`  ✗ ${f.kind}: cosine ${f.sim.toFixed(4)} < threshold ${f.threshold} — looks-wrong, or bless new goldens deliberately`);
      } else {
        console.error(`  ✗ ${f.kind}: ${f.reason}`);
      }
    }
    process.exit(1);
  }
  console.log(`[semantic-goldens] OK — ${rows.length} effects match their golden embeddings (${golden.model.id})`);
}

main();
