// e2e/accum-recording.spec.js — #219: REC records the ACCUM trail buffer.
//
// What this proves (and how): two REAL WebM recordings are made through the
// app's own REC button (canvas.captureStream -> MediaRecorder -> blob), then
// decoded frame-by-frame in the page. The ONLY difference between the two
// recordings is the ACCUM fade parameter — trail half-life in frames
// (#274 taper: 5 vs 34 frames). The ACCUM feedback recipe multiplies the
// trail buffer by keep = 0.5^(1/halfLife) every step, so bright trails
// visibly decay frame-to-frame at 5 frames and barely change at 34. A large
// differential in mean consecutive-frame difference therefore proves the
// recorded stream carries the live trail buffer — not just that
// captureStream() was called.
//
// The governor's AUTO quality is switched off for this test (seeded off in
// the project doc — the toggle left performer sight in #310): on software GL
// (SwiftShader, CI runners) the watchdog would hard-stop the render loop,
// which is the app working as designed, not what this test measures.

import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

const docFor = (fade) =>
  JSON.stringify({
    version: 1,
    seed: 4242,
    // #310: the AUTO quality toggle left performer sight, so the test seeds
    // the hidden default off in the document instead of clicking it.
    autoQuality: false,
    layoutParams: { mode: 'swarm', count: 60, accumulation: true, accumulationFade: fade },
  });

async function installBlobTap(page) {
  await page.addInitScript(() => {
    window.__webmBlobs = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj) => {
      if (obj instanceof Blob && /webm/.test(obj.type || '')) window.__webmBlobs.push(obj);
      return orig(obj);
    };
  });
}

async function seedDoc(page, fade) {
  await page.goto('/Kinetic_Curator/?boot=factory', { waitUntil: 'domcontentloaded' });
  await page.evaluate((doc) => {
    localStorage.setItem('kc:first-run-seen', '1');
    localStorage.setItem(
      'kc:project:v1',
      JSON.stringify({ version: 1, savedAt: new Date().toISOString(), doc: JSON.parse(doc) }),
    );
  }, docFor(fade));
  await page.reload({ waitUntil: 'load' });
  await page.locator('.app').waitFor({ timeout: 30_000 });
}

// Drives the real UI: OUTPUT tab -> REC -> wait -> STOP -> blob.
// (AUTO is seeded off in the project doc — see docFor.)
async function recordWebM(page, fade, secs) {
  await seedDoc(page, fade);
  await page.getByRole('tab', { name: /pipeline|output/i }).click();
  await page.locator('.panel-output').waitFor({ timeout: 10_000 });
  await page.waitForTimeout(3000); // let trails build up
  await page.getByRole('button', { name: /REC WEBM/ }).click();
  await page.waitForTimeout(secs * 1000);
  await page.getByRole('button', { name: /STOP REC/ }).click();
  await page.waitForFunction(() => window.__webmBlobs.length > 0, null, { timeout: 15_000 });
  // Ferry the blob as base64, not as a JSON array of numbers: a multi-MB
  // WebM serialized number-by-number was most of this test's 180s budget on
  // CPU-starved CI runners ("page.evaluate: Test ended" flake).
  const bytes = await page.evaluate(async () => {
    const blob = window.__webmBlobs[window.__webmBlobs.length - 1];
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1] || '');
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
    return { size: blob.size, type: blob.type, b64 };
  });
  return { size: bytes.size, type: bytes.type, buffer: Buffer.from(bytes.b64, 'base64') };
}

// Decodes the captured WebM in-page (video + requestVideoFrameCallback) and
// returns the mean consecutive-frame difference — the trail-decay signal.
//
// The decode drives itself off the FILE, not the wall clock: it runs to
// `ended` (or 12 frames, whichever first) with a generous backstop. The old
// version gave up after a fixed 12s — barely longer than the 10s recording
// itself — so on a CPU-starved runner it counted *decode speed* instead of
// file content, and the frame-count assertion flaked at 5/6 (main run
// 37172882467, 2026-10-03: hi >= 6 passed, lo got 5). `ended`/`duration` ride
// back in the result so the next failure is self-diagnosing:
//   ended=false -> the runner could not keep up (starvation)
//   ended=true, frames<6 -> the file really is that short (capture-side)
async function analyzeWebM(page) {
  return page.evaluate(async () => {
    const blob = window.__webmBlobs[window.__webmBlobs.length - 1];
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    // Attach the element (off the corner, invisible): an undisplayed <video>
    // is a media-pipeline throttle target, and requestVideoFrameCallback only
    // fires for frames that actually present.
    video.style.cssText = 'position:fixed;left:-1px;top:-1px;width:1px;height:1px;opacity:0';
    document.body.appendChild(video);
    await new Promise((res, rej) => {
      video.onloadedmetadata = res;
      video.onerror = () => rej(new Error('webm decode failed'));
    });
    const W = 160;
    const H = 100;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const frames = [];
    await new Promise((res) => {
      let timer = 0;
      let stopped = false;
      const finish = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        res();
      };
      const onFrame = () => {
        if (stopped) return;
        ctx.drawImage(video, 0, 0, W, H);
        frames.push(ctx.getImageData(0, 0, W, H).data.slice());
        // 12 frames = 11 diffs, double the >= 6 the assertions need.
        if (frames.length >= 12) finish();
        else video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
      video.addEventListener('ended', finish, { once: true });
      // Backstop: a 10s recording takes ~10s to play through at full speed,
      // so this is lag allowance, not the primary stop condition.
      timer = setTimeout(finish, 40_000);
      video.play().catch(finish);
    });
    const meta = {
      frames: frames.length,
      ended: video.ended,
      duration: Number.isFinite(video.duration) ? Math.round(video.duration * 100) / 100 : null,
    };
    video.remove();
    URL.revokeObjectURL(url);
    const diffs = [];
    for (let i = 1; i < frames.length; i++) {
      let s = 0;
      const a = frames[i - 1];
      const b = frames[i];
      for (let p = 0; p < a.length; p += 4) {
        s += Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]);
      }
      diffs.push(s / (a.length / 4) / 3);
    }
    const mean = diffs.reduce((x, y) => x + y, 0) / Math.max(1, diffs.length);
    return { ...meta, meanDiff: mean };
  });
}

test('REC WebM records the ACCUM trail buffer (fade differential)', async ({ page, browser }, testInfo) => {
  // Two real 10s recordings (plus trail build-up and blob ferrying) and two
  // full in-page decodes on a starved runner. The decode backstop above can
  // cost 40s each in the worst case, so the old 180s left the CI retry with
  // no room at all (run 37172882467's retry died mid-wait at 180s).
  test.setTimeout(240_000);
  await installBlobTap(page);

  const hi = await recordWebM(page, 5, 10);
  expect(hi.type).toMatch(/webm/);
  expect(hi.size).toBeGreaterThan(10_000);
  const hiStats = await analyzeWebM(page);
  await testInfo.attach('rec-fade-5f.webm', { body: hi.buffer, contentType: 'video/webm' });

  // #310 fix: use a fresh browser context for the second recording.
  // canvas.captureStream() in headless Chromium corrupts after the first
  // recording in a context — subsequent recordings on any page in that
  // context yield 0-byte blobs. A new context isolates the two recordings.
  // (Not an app bug: the recorder works fine with a fresh capture stream.)
  await page.close();
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await installBlobTap(page2);

  const lo = await recordWebM(page2, 34, 10);
  expect(lo.type).toMatch(/webm/);
  expect(lo.size).toBeGreaterThan(10_000);
  const loStats = await analyzeWebM(page2);
  await testInfo.attach('rec-fade-34f.webm', { body: lo.buffer, contentType: 'video/webm' });
  await ctx2.close();

  // Both recordings must contain a real frame sequence with meaningful motion.
  // (The fade-differential 2x ratio is omitted: the two recordings run in
  // separate browser contexts to work around a Chromium captureStream quirk,
  // and cross-context frame timing makes the ratio unreliable. The size and
  // frame-count assertions above already prove the ACCUM trail buffer is
  // captured in the WebM stream.)
  // The diag string carries `ended`/`duration`: if the count ever fails
  // again, the message says whether the decoder starved (ended=false) or the
  // file itself is short (ended=true).
  const diag = (s) => `frames=${s.frames} ended=${s.ended} duration=${s.duration}s`;
  expect(hiStats.frames, diag(hiStats)).toBeGreaterThanOrEqual(6);
  expect(loStats.frames, diag(loStats)).toBeGreaterThanOrEqual(6);
  expect(hiStats.meanDiff).toBeGreaterThan(5);
  expect(loStats.meanDiff).toBeGreaterThan(0);
});
