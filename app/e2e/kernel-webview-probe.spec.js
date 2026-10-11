// Kernel worker WebView probe — issue #1312 (kernel worker 3/3).
//
// What: loads the self-contained probe page (app/public/probes/) in a real
// WebKit engine with iPad device emulation and asserts every check passes:
// new Worker() (file + Blob URL), the versioned kernel protocol
// (INIT->READY, STEP->FRAME, SET_PARAM->PARAM_ACK), postMessage with
// transferable ArrayBuffers in both directions, and a bit-exact round-trip
// of Float32Array SoA column buffers.
//
// Why opt-in: CI installs chromium only (`npx playwright install chromium`);
// this spec needs `npx playwright install webkit` plus host system deps, so it
// SKIPS unless E2E_WEBKIT=1. A skip is reported as skipped — never as a pass.
//
// Re-run:  E2E_WEBKIT=1 npx playwright test e2e/kernel-webview-probe.spec.js
// (the config's webServer starts `vite preview` on :4173 automatically)
/* global process: readonly */
// `process` is declared above because this repo's eslint config scopes node
// globals to tooling configs; specs run in the Node test runner, so it exists.
import { test, expect, webkit, devices } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:4173'; // matches playwright.config.js
// The app builds with vite `base: '/Kinetic_Curator/'` (VITE_BASE unset in e2e),
// so static probe files live under the base path, not the server root.
const PROBE_PATH = '/Kinetic_Curator/probes/kernel-worker-probe.html';

test.describe('kernel worker webview probe (#1312)', () => {
  test.skip(
    !process.env.E2E_WEBKIT,
    'WebKit-only probe: run with E2E_WEBKIT=1 (needs `npx playwright install webkit` + system deps). CI runs chromium only, so this skips there by design.'
  );

  test('Worker + transferable Float32Array columns pass on WebKit (iPad emulation)', async () => {
    test.setTimeout(120_000);
    const browser = await webkit.launch();
    let context;
    try {
      context = await browser.newContext({
        ...devices['iPad Pro 11'],
        baseURL: BASE_URL,
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (err) => pageErrors.push(String(err)));
      await page.goto(PROBE_PATH);
      await page.waitForFunction(
        () => window.__kernelWorkerProbe && window.__kernelWorkerProbe.done,
        null,
        { timeout: 60_000 }
      );
      const result = await page.evaluate(() => window.__kernelWorkerProbe);
      await test.info().attach('probe-result.json', {
        body: JSON.stringify(result, null, 2),
        contentType: 'application/json',
      });
      expect(pageErrors, 'probe page threw no page errors').toEqual([]);
      expect(result.checks.length, 'probe ran its checks').toBeGreaterThan(0);
      for (const check of result.checks) {
        expect(check.pass, `${check.id} — ${check.label}: ${check.detail}`).toBe(true);
      }
      expect(result.failed, 'no probe check failed').toBe(0);
    } finally {
      if (context) await context.close();
      await browser.close();
    }
  });
});
