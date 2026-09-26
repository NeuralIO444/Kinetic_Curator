// #533 PR1 — upload-byte measurement (measure-only).
// Opens the app, lets the live canvas animate for ~60s, then reads the
// window.__uploadMeter debug handle wired into renderer.mjs and reports:
// bytes uploaded (bufferSubData) vs bytes changed (byte-diffed against the
// previous frame). The scenario passes when the meter reports sane values
// (uploaded > 0); the numbers go into the PR body, where the issue's
// decision gate lives: changed/uploaded > 0.7 → close as measured-not-worth-it.
//
// #533 PR2 — also reports pushedBytes (physical bytes handed to
// bufferSubData, sub-ranges included). Set KC_DIRTY=0 to disable the dirty
// sub-range optimization via the debug handle and measure the
// pre-optimization baseline on the same build.

const MEASURE_MS = 60_000;

const fmtBytes = (n) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
  return `${n} B`;
};

export default {
  describe: 'Run the live canvas animated for 60s and read the #533 upload-byte meter (bufferSubData bytes vs byte-diffed changed bytes).',
  async run(ctx) {
    const page = await ctx.newPage();
    // Seed the project document with autoQuality:false — on software GL
    // (SwiftShader, CI runners) the governor's watchdog would hard-stop the
    // render loop after ~2s of <16fps, which is the app working as designed,
    // not what this measurement is about. Same pattern as
    // e2e/loop-capture.spec.js: parseProject reads autoQuality from the doc.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('kc:first-run-seen', '1');
        localStorage.setItem('kc:project:v1', JSON.stringify({
          version: 1,
          savedAt: new Date().toISOString(),
          doc: {
            version: 1,
            seed: 5330533,
            autoQuality: false,
            layoutParams: { mode: 'swarm', count: 60 },
          },
        }));
      } catch { /* ignore */ }
    });
    await ctx.openApp(page);

    // The meter attaches when renderer.mjs loads; frames tick only once the
    // live canvas is actually drawing.
    await page.waitForFunction(
      () => typeof window.__uploadMeter === 'function' || (window.__uploadMeter && typeof window.__uploadMeter.snapshot === 'function'),
      null, { timeout: 30_000 },
    );
    await page.waitForFunction(() => window.__uploadMeter.snapshot().frames > 10, null, { timeout: 30_000 });
    // #533 PR2: KC_DIRTY=0 measures the pre-optimization baseline (full
    // uploads) on the same build. Reset also drops the renderer's upload
    // shadow, so the first post-reset upload is always full.
    if (process.env.KC_DIRTY === '0') {
      await page.evaluate(() => window.__uploadMeter.setDirtyUploads(false));
    }
    await page.evaluate(() => window.__uploadMeter.reset());

    const t0 = Date.now();
    await page.waitForTimeout(MEASURE_MS);
    const snap = await page.evaluate(() => window.__uploadMeter.snapshot());
    const secs = (Date.now() - t0) / 1000;

    const ratio = snap.uploadedBytes > 0 ? snap.changedBytes / snap.uploadedBytes : NaN;
    const pushedPerFrame = snap.frames > 0 ? snap.pushedBytes / snap.frames : NaN;
    const fps = snap.frames / secs;
    const detail =
      `frames=${snap.frames} (${fps.toFixed(1)} fps over ${secs.toFixed(0)}s) · ` +
      `uploads=${snap.uploadCalls} · ` +
      `uploaded=${fmtBytes(snap.uploadedBytes)} (${snap.uploadedBytes} B) · ` +
      `changed=${fmtBytes(snap.changedBytes)} (${snap.changedBytes} B) · ` +
      `changed/uploaded=${Number.isFinite(ratio) ? ratio.toFixed(3) : 'n/a'} · ` +
      `pushed=${fmtBytes(snap.pushedBytes)} (${snap.pushedBytes} B over ${snap.pushedCalls} GL calls, ` +
      `${Number.isFinite(pushedPerFrame) ? Math.round(pushedPerFrame) : 'n/a'} B/frame) · ` +
      `dirty=${process.env.KC_DIRTY === '0' ? 'OFF (baseline)' : 'ON'} · ` +
      `gate: changed/uploaded > 0.7 → ${Number.isFinite(ratio) && ratio > 0.7 ? 'FIRES (recommend measured-not-worth-it)' : 'does not fire'}`;

    ctx.check('meter reports uploads during animation', snap.uploadedBytes > 0, detail);
    // Software GL (SwiftShader) renders ~1s+/frame; the bar is that the loop
    // kept ticking past the initial mount renders, not a wall-clock fps.
    ctx.check('frames kept ticking', snap.frames > 10, `frames=${snap.frames} in ${secs.toFixed(0)}s`);
    ctx.check('changed bytes ≤ uploaded bytes', snap.changedBytes <= snap.uploadedBytes, detail);
    ctx.check('pushed bytes ≤ uploaded bytes (sub-ranges only)', snap.pushedBytes <= snap.uploadedBytes, detail);
    ctx.check('upload calls tracked', snap.uploadCalls > 0, `uploads=${snap.uploadCalls}`);
  },
};
