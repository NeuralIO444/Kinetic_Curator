#!/usr/bin/env node
// e2e/agent-stress.mjs — issue 2509: the standing manifest-driven stress script.
//
// Boots a build, reads the SHIPPED manifest off the running app (window.__KC_UI__),
// and walks every registered control through the bridge: sliders and segmented
// controls across both extremes, toggles flipped and restored, family controls on
// one representative instance. Per step it records the stage read (fps, node count,
// tape, watchdog) and any console errors, then writes a JSON report and a markdown
// report in the 2026-11-24 stress session's A/B shape (A = breaks, B = observations).
//
// Read-backs POLL until they settle: layout params are spring-smoothed on their way
// into the store (spine E's slider springs), and a few handlers (audio) land
// asynchronously — a synchronous read right after an act measures the spring's
// start, not the landing. Polling measures what the performer ends up seeing.
//
// With --baseline <file> the run diffs against the accepted baseline and exits
// non-zero on NEW breaks only (a failure the baseline already carries is reported
// but does not fail the run). Without a baseline, any failed walk fails the run.
// --write-baseline <file> records the run's per-control statuses as a baseline.
//
// Usage:
//   node e2e/agent-stress.mjs [--base-url http://127.0.0.1:4173/Kinetic_Curator/]
//                             [--baseline e2e/agent-stress.baseline.json]
//                             [--write-baseline <file>] [--out <dir>]
//                             [--only <id-substring>] [--serve-from <url>] [--swiftshader]
//
// --serve-from <url>: navigate to --base-url but fulfill its requests from <url>
// instead (route interception). This is how the sandbox drives a local preview:
// its Chromium cannot navigate to localhost, so it loads a fake host whose bytes
// come from the local preview server. On a Mac / in CI, omit it and point
// --base-url straight at the preview server.

import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS } from '../src/data/assets/index.js';
import { PALETTES } from '../src/data/palettes.js';
import { getPresetsByGroup } from '../src/data/presets.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const BASE_URL = opt('base-url', 'http://127.0.0.1:4173/Kinetic_Curator/');
const SERVE_FROM = opt('serve-from', null);
const OUT_DIR = opt('out', path.join(HERE, 'agent-stress-out'));
const ONLY = opt('only', null);
const BASELINE_FILE = opt('baseline', null);
const WRITE_BASELINE = opt('write-baseline', null);
const SETTLE_MS = 150;
const POLL_MS = 150;
const POLL_TIMEOUT_MS = 8000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sig = (text) => String(text).replace(/\d+/g, '#').slice(0, 160);
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// For toggle-restore comparisons: an explicit false in a map means the same as the
// key being absent (the app's own toggles write both forms).
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) {
      if (x === false || x === null || x === undefined) continue;
      out[k] = normalize(x);
    }
    return out;
  }
  return v;
}
const sameState = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

function channelUses(entry, token) {
  return JSON.stringify(entry.channel ?? {}).includes(token);
}

function familyParam(entry, snapshot) {
  if (entry.walkParam !== undefined) return entry.walkParam;
  if (entry.id === 'build.lock') return 'count';
  if (entry.id === 'topbar.swatch-lock') return 0;
  if (entry.id === 'topbar.look-preset') {
    for (const g of getPresetsByGroup()) if (g.presets?.length) return g.presets[0].id;
    return undefined;
  }
  if (entry.id.startsWith('build.layer-')) {
    const layers = snapshot.layers ?? [];
    return (layers.find((l) => l.type === 'content') ?? layers[0])?.id;
  }
  if (entry.id.startsWith('assets.tile-') || entry.id.startsWith('inspector.')) {
    return ASSETS[0]?.id;
  }
  if (entry.id === 'topbar.palette-chip') return PALETTES[1]?.id ?? PALETTES[0]?.id;
  return undefined;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const launchArgs = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
  if (flag('swiftshader')) launchArgs.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  // A fake host is not a secure context, so getUserMedia is denied there; when the
  // run is served through route interception, treat the origin as secure so the
  // audio controls can do what they do on the hosted (https) build.
  if (SERVE_FROM) {
    launchArgs.push(`--unsafely-treat-insecure-origin-as-secure=${new URL(BASE_URL).origin}`);
  }
  const browser = await chromium.launch({ args: launchArgs });
  const context = await browser.newContext();
  if (SERVE_FROM) await context.grantPermissions(['microphone'], { origin: new URL(BASE_URL).origin }).catch(() => {});
  const page = await context.newPage();

  const consoleErrors = [];
  let currentStep = 'boot';
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ step: currentStep, text: sig(msg.text()) });
  });
  page.on('pageerror', (err) => consoleErrors.push({ step: currentStep, text: sig(`pageerror: ${err.message}`) }));

  if (SERVE_FROM) {
    const from = new URL(SERVE_FROM);
    const to = new URL(BASE_URL);
    await context.route(`${to.origin}/**`, async (route) => {
      const reqUrl = new URL(route.request().url());
      const target = new URL(reqUrl.pathname + reqUrl.search, from.origin);
      try {
        const res = await fetch(target);
        const body = Buffer.from(await res.arrayBuffer());
        await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body });
      } catch {
        await route.abort();
      }
    });
  }

  await page.addInitScript(() => {
    try {
      localStorage.setItem('kc:first-run-seen', '1');
    } catch {
      /* storage may be unavailable; the overlay also dismisses with Escape */
    }
  });
  await page.goto(BASE_URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__KC_UI__, null, { timeout: 30000 });

  const ui = (fn, arg) => page.evaluate(fn, arg);
  const readPrimary = (id, param) =>
    ui(
      (a) => {
        const r = window.__KC_UI__.read(a.id, a.param);
        const vals = r?.values ? Object.values(r.values) : [];
        return vals.length > 0 ? vals[0] : undefined;
      },
      { id, param },
    );
  // Poll the primary read until `done(value)` or the timeout; returns the last value.
  const pollRead = async (id, param, done) => {
    const start = Date.now();
    let v = await readPrimary(id, param);
    while (!done(v) && Date.now() - start < POLL_TIMEOUT_MS) {
      await sleep(POLL_MS);
      v = await readPrimary(id, param);
    }
    return v;
  };

  // Boot may trip the headless watchdog (PERF PAUSED): Space is the app's own resume.
  for (let i = 0; i < 20; i++) {
    const s = await ui(() => window.__KC_UI__.stage());
    if (s.nodeCount > 0 && s.running) break;
    if (!s.running) await page.keyboard.press('Space').catch(() => {});
    await sleep(500);
  }
  const bootStage = await ui(() => window.__KC_UI__.stage());
  const manifest = await ui(() => window.__KC_UI__.manifest());
  let snapshot = await ui(() => window.__KC_UI__.state(['layers']));

  const results = [];
  const restoreStack = [];
  const controls = manifest.controls.filter((c) => !ONLY || c.id.includes(ONLY));

  for (const entry of controls) {
    currentStep = entry.id;
    const errorsBefore = consoleErrors.length;
    const record = { id: entry.id, panel: entry.panel, stress: entry.stress };
    try {
      if (entry.stress === 'skip') {
        record.status = 'skip';
        record.detail = entry.note ?? 'registered as skip';
      } else if (entry.stress === 'probe') {
        const r = await ui((id) => window.__KC_UI__.read(id), entry.id);
        record.status = 'probe';
        record.detail = entry.note ?? 'read only';
        record.read = r?.values ?? null;
      } else {
        await walk(entry, record);
        if (record.status === 'fail') {
          // One retry: on a loaded machine a spring settle can outlast even a
          // generous poll. A control that fails twice is a failure.
          const firstDetail = record.detail;
          const retry = { id: entry.id, panel: entry.panel, stress: entry.stress };
          await walk(entry, retry);
          if (retry.status !== 'fail') {
            Object.assign(record, retry, {
              passedOnRetry: true,
              detail: `${retry.detail} (passed on retry; first attempt: ${firstDetail})`,
            });
          } else {
            record.detail = `${retry.detail} (first attempt: ${firstDetail})`;
          }
        }
      }
    } catch (e) {
      record.status = 'fail';
      record.detail = `script error: ${e.message}`;
    }
    record.stage = await ui(() => window.__KC_UI__.stage()).catch(() => null);
    record.errors = consoleErrors.slice(errorsBefore).map((e) => e.text);
    results.push(record);
    console.log(`${record.status.padEnd(5)} ${record.id}`);
  }

  async function walk(entry, record) {
    // The actuation plan: a list of { value, param } steps plus how to judge them.
    const paramIsSequence =
      entry.family && entry.options && channelUses(entry, '$param') && !channelUses(entry, '$value');
    let param = entry.family ? familyParam(entry, snapshot) : undefined;
    if (entry.family && param === undefined && !paramIsSequence) {
      record.status = 'probe';
      record.detail = 'no representative instance derivable in this profile; read only';
      const r = await ui((id) => window.__KC_UI__.read(id), entry.id);
      record.read = r?.values ?? null;
      return;
    }
    const steps = [];
    let mode = 'values';
    if (paramIsSequence) {
      mode = entry.kind === 'toggle' ? 'param-toggle' : 'values';
      const seq =
        entry.kind === 'toggle' ? [entry.options[0]] : [entry.options[0], entry.options[entry.options.length - 1]];
      for (const p of seq) steps.push({ value: undefined, param: p });
      if (entry.kind === 'toggle') steps.push({ value: undefined, param: seq[0] });
    } else if (entry.kind === 'toggle' && entry.options?.every((o) => typeof o === 'boolean')) {
      mode = 'values';
      for (const v of entry.options) steps.push({ value: v, param });
    } else if (entry.kind === 'toggle') {
      mode = 'flips';
      steps.push({ value: undefined, param }, { value: undefined, param });
    } else {
      const values = entry.walk ?? entry.stops ?? entry.options;
      if (values && values.length > 0) {
        const seq = [values[0], values[values.length - 1]];
        if (values.length > 2) seq.push(values[Math.floor(values.length / 2)]);
        for (const v of seq) steps.push({ value: v, param });
      } else if (entry.range) {
        steps.push({ value: entry.range.min, param }, { value: entry.range.max, param });
      } else {
        steps.push({ value: undefined, param });
        mode = 'fire';
      }
    }

    const hasReads = entry.reads && entry.reads.length > 0;
    const initial = hasReads ? await readPrimary(entry.id, param) : undefined;
    const landed = [];
    for (const step of steps) {
      const pre = hasReads ? await readPrimary(entry.id, step.param) : undefined;
      const res = await ui((a) => window.__KC_UI__.act(a.id, a.value, a.param), {
        id: entry.id,
        value: step.value,
        param: step.param,
      });
      if (!res?.ok) {
        record.status = 'fail';
        record.detail = `act failed: ${res?.error ?? 'act returned not-ok'}`;
        return;
      }
      if (!hasReads) {
        await sleep(SETTLE_MS);
        landed.push(undefined);
      } else if (mode === 'flips' || mode === 'param-toggle') {
        // Flip detection is on the raw read: some keys are absence-encoded
        // (feedsAccum exists only while off), so a normalized compare would
        // hide a real change.
        landed.push(await pollRead(entry.id, step.param, (v) => !deepEqual(v, pre)));
      } else if (step.value !== undefined) {
        landed.push(await pollRead(entry.id, step.param, (v) => deepEqual(v, step.value) || !deepEqual(v, pre)));
      } else if (mode === 'values') {
        // Param-driven step (the param is the value): poll until the read moves.
        landed.push(await pollRead(entry.id, step.param, (v) => !deepEqual(v, pre)));
      } else {
        await sleep(SETTLE_MS);
        landed.push(await readPrimary(entry.id, step.param));
      }
    }

    if (mode === 'flips' || mode === 'param-toggle') {
      const flipped = !deepEqual(landed[0], initial);
      const restored =
        landed.length < 2 ||
        deepEqual(landed[landed.length - 1], initial) ||
        sameState(landed[landed.length - 1], initial);
      record.status = flipped && restored ? 'pass' : 'fail';
      record.detail = flipped
        ? restored
          ? 'flipped and restored'
          : `flipped but did not restore (initial ${JSON.stringify(initial)}, landed ${JSON.stringify(landed)})`
        : `toggle produced no change (initial ${JSON.stringify(initial)})`;
    } else if (mode === 'values' && hasReads) {
      const finalTarget = steps[steps.length - 1].value;
      const distinct = new Set(landed.map((v) => JSON.stringify(normalize(v))));
      if (deepEqual(landed[landed.length - 1], finalTarget)) {
        record.status = 'pass';
        record.detail = 'read-back matches the final target';
      } else if (distinct.size >= 2) {
        record.status = 'pass';
        record.detail = `read-back moved across the range but landed transformed (targets ${JSON.stringify(steps.map((s) => s.value))} → landed ${JSON.stringify(landed)})`;
      } else {
        record.status = 'fail';
        record.detail = `no-effect: read-back never changed (initial ${JSON.stringify(initial)}, landed ${JSON.stringify(landed)})`;
      }
    } else {
      record.status = 'pass';
      record.detail = 'actuated without error';
    }

    // Restore the starting value where that is a plain value write; deferred
    // restores (sun, accum) run at the end so dependent controls see them live.
    if (record.status !== 'fail' && mode === 'values' && hasReads && channelUses(entry, '$value')) {
      if (initial !== undefined && typeof initial !== 'object') {
        if (entry.deferRestore) restoreStack.push({ id: entry.id, value: initial, param });
        else {
          await ui((a) => window.__KC_UI__.act(a.id, a.value, a.param), { id: entry.id, value: initial, param });
          await pollRead(entry.id, param, (v) => deepEqual(v, initial)).catch(() => {});
        }
      }
    }
  }

  // Deferred restores, reverse order.
  for (const r of restoreStack.reverse()) {
    await ui((a) => window.__KC_UI__.act(a.id, a.value, a.param), r).catch(() => {});
  }
  const endStage = await ui(() => window.__KC_UI__.stage()).catch(() => null);
  await browser.close();

  const summary = { walk: 0, pass: 0, fail: 0, probe: 0, skip: 0 };
  for (const r of results) {
    if (r.stress === 'walk') summary.walk += 1;
    if (r.status === 'pass') summary.pass += 1;
    if (r.status === 'fail') summary.fail += 1;
    if (r.status === 'probe') summary.probe += 1;
    if (r.status === 'skip') summary.skip += 1;
  }
  const errorSigs = [...new Set(consoleErrors.map((e) => e.text))];

  // ── baseline diff ─────────────────────────────────────────────────────────
  let baseline = null;
  const newBreaks = [];
  if (BASELINE_FILE && existsSync(BASELINE_FILE)) {
    baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
    for (const r of results) {
      const was = baseline.results?.[r.id];
      if (r.status === 'fail' && was !== 'fail') newBreaks.push(`${r.id}: new failure (baseline: ${was ?? 'absent'})`);
      if (was === undefined) newBreaks.push(`${r.id}: new control, not in baseline`);
    }
    if (!ONLY) {
      for (const id of Object.keys(baseline.results ?? {})) {
        if (!results.some((r) => r.id === id)) newBreaks.push(`${id}: in baseline but missing from the manifest`);
      }
    }
    for (const s of errorSigs) {
      if (!(baseline.consoleErrors ?? []).includes(s)) newBreaks.push(`console: new error signature: ${s}`);
    }
  }
  if (WRITE_BASELINE) {
    const data = {
      schema: 'kc-agent-stress-baseline/1',
      build: manifest.build,
      results: Object.fromEntries(results.map((r) => [r.id, r.status])),
      consoleErrors: errorSigs,
    };
    writeFileSync(WRITE_BASELINE, JSON.stringify(data, null, 2) + '\n');
    // Keep the committed baseline format:check-clean (prettier collapses
    // short arrays); best-effort — a missing prettier is not a run failure.
    try {
      execFileSync('npx', ['prettier', '--write', WRITE_BASELINE], { stdio: 'ignore' });
    } catch {
      /* the maintainer can format it by hand */
    }
    console.log(`baseline written: ${WRITE_BASELINE}`);
  }

  const report = {
    schema: 'kc-agent-stress/1',
    build: manifest.build,
    baseUrl: BASE_URL,
    serveFrom: SERVE_FROM,
    startedAt: new Date().toISOString(),
    manifestCounts: manifest.counts,
    bootStage,
    endStage,
    summary,
    consoleErrors: errorSigs,
    baselineDiff: baseline ? { file: BASELINE_FILE, newBreaks } : null,
    results,
  };
  const jsonPath = path.join(OUT_DIR, 'agent-stress-report.json');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');

  // ── markdown report, the session's A/B shape ─────────────────────────────
  const fails = results.filter((r) => r.status === 'fail');
  const md = [];
  md.push(`# Agent stress run — build ${manifest.build}`);
  md.push('');
  md.push(
    `Manifest: ${manifest.counts.controls} controls across ${manifest.counts.panels} panels · walked ${summary.walk}, passed ${summary.pass}, failed ${summary.fail}, probed ${summary.probe}, skipped ${summary.skip}.`,
  );
  md.push(
    `Boot stage: fps ${bootStage?.fps}, nodes ${bootStage?.nodeCount}, tape ${bootStage?.tapePct}%, watchdog ${bootStage?.watchdog}. End stage: fps ${endStage?.fps}, nodes ${endStage?.nodeCount}, tape ${endStage?.tapePct}%, watchdog ${endStage?.watchdog}.`,
  );
  md.push('');
  md.push('## A — breaks');
  md.push('');
  if (fails.length === 0 && newBreaks.length === 0) md.push('None.');
  fails.forEach((r, i) => md.push(`${i + 1}. **${r.id}** — ${r.detail}`));
  if (baseline) {
    md.push('');
    md.push(`Baseline diff (${BASELINE_FILE}): ${newBreaks.length} new break(s).`);
    newBreaks.forEach((b) => md.push(`- ${b}`));
  }
  md.push('');
  md.push('## B — observations');
  md.push('');
  const retried = results.filter((r) => r.passedOnRetry);
  md.push(`Passed only on retry (${retried.length}):`);
  if (retried.length === 0) md.push('None.');
  retried.forEach((r) => md.push(`- ${r.id} — ${r.detail}`));
  md.push('');
  md.push(`Console error signatures (${errorSigs.length}):`);
  errorSigs.forEach((s) => md.push(`- ${s}`));
  md.push('');
  md.push('Probed (read only, with the registry’s reason):');
  results.filter((r) => r.status === 'probe').forEach((r) => md.push(`- ${r.id} — ${r.detail}`));
  md.push('');
  md.push('Skipped (with the registry’s reason):');
  results.filter((r) => r.status === 'skip').forEach((r) => md.push(`- ${r.id} — ${r.detail}`));
  md.push('');
  const mdPath = path.join(OUT_DIR, 'agent-stress-report.md');
  writeFileSync(mdPath, md.join('\n'));

  console.log(`report: ${jsonPath}`);
  console.log(`report: ${mdPath}`);
  console.log(
    `summary: walked ${summary.walk}, passed ${summary.pass}, failed ${summary.fail}, probed ${summary.probe}, skipped ${summary.skip}; new breaks: ${newBreaks.length}`,
  );
  if (baseline) process.exit(newBreaks.length > 0 ? 1 : 0);
  process.exit(summary.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`agent-stress: ${e.message}`);
  process.exit(2);
});
