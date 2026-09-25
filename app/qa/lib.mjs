// qa/lib.mjs — the QA harness kit (see qa/README.md). Not part of the e2e gate.
//
// A scenario is `export default { name, describe, async run(ctx) }`. ctx gives it a
// fresh page, `check()` for pass/fail steps and `snap()` for screenshots. Everything
// a scenario records lands in qa-report/index.html.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REPORT_DIR = join(APP, 'qa-report');

const up = async (url) => { try { return (await fetch(url)).ok; } catch { return false; } };

/**
 * Use the server at QA_URL when it answers, otherwise start a private Vite dev
 * server (zero setup). Returns { url, stop }.
 */
export async function ensureServer() {
  const given = process.env.QA_URL;
  if (given && await up(given)) return { url: given, stop: () => {} };
  const port = 5199;
  const url = `http://127.0.0.1:${port}/Kinetic_Curator/`;
  if (await up(url)) return { url, stop: () => {} };
  const child = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: APP, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up(url)); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up(url))) { child.kill(); throw new Error('dev server did not come up on ' + url); }
  return { url, stop: () => child.kill() };
}

/** Run one scenario; returns { name, describe, steps, pass, error }. */
export async function runScenario(scn, baseUrl, { headed = false } = {}) {
  const dir = join(REPORT_DIR, scn.name);
  mkdirSync(dir, { recursive: true });
  const steps = [];
  let shotN = 0;
  const browser = await chromium.launch({ headless: !headed });
  const contexts = [];

  const ctx = {
    baseUrl,
    /** Fresh isolated browser context + page, first-run overlay suppressed. */
    async newPage() {
      const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      contexts.push(c);
      const page = await c.newPage();
      await page.addInitScript(() => { try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
      return page;
    },
    async openApp(page) {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('.app').waitFor({ timeout: 30_000 });
    },
    async tab(page, name) {
      await page.getByRole('tab', { name }).first().click();
    },
    /** Record a pass/fail step. `detail` is shown next to it. */
    check(label, pass, detail = '') {
      steps.push({ kind: 'check', label, pass: !!pass, detail: String(detail) });
      return !!pass;
    },
    /** Screenshot the page, or one locator (scrolled into view first). */
    async snap(page, label, locator = null) {
      const file = `${String(++shotN).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
      try {
        if (locator) { await locator.scrollIntoViewIfNeeded(); await locator.screenshot({ path: join(dir, file) }); }
        else await page.screenshot({ path: join(dir, file) });
        steps.push({ kind: 'shot', label, file: `${scn.name}/${file}` });
      } catch (e) {
        steps.push({ kind: 'check', label: `screenshot: ${label}`, pass: false, detail: e.message });
      }
    },
  };

  let error = null;
  try { await scn.run(ctx); } catch (e) { error = e; steps.push({ kind: 'check', label: 'scenario threw', pass: false, detail: e.stack || String(e) }); }
  await Promise.all(contexts.map((c) => c.close().catch(() => {})));
  await browser.close();
  const pass = !error && steps.filter((s) => s.kind === 'check').every((s) => s.pass);
  return { name: scn.name, describe: scn.describe || '', steps, pass, error: error ? String(error) : null };
}

export function writeReport(results, html) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const file = join(REPORT_DIR, 'index.html');
  writeFileSync(file, html(results));
  return file;
}
