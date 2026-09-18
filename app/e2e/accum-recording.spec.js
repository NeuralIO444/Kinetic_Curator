// e2e/accum-recording.spec.js — #219: REC records the ACCUM trail buffer.
//
// What this proves (and how): two REAL WebM recordings are made through the
// app's own REC button (canvas.captureStream -> MediaRecorder -> blob), then
// decoded frame-by-frame in the page. The ONLY difference between the two
// recordings is the ACCUM fade parameter (0.88 vs 0.98). The ACCUM feedback
// recipe multiplies the trail buffer by `fade` every step, so bright trails
// visibly decay frame-to-frame at 0.88 and barely change at 0.98. A large
// differential in mean consecutive-frame difference therefore proves the
// recorded stream carries the live trail buffer — not just that
// captureStream() was called.
//
// The governor's AUTO quality is switched off for this test: on software GL
// (SwiftShader, CI runners) the watchdog would hard-stop the render loop,
// which is the app working as designed, not what this test measures.

import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

const docFor = (fade) =>
  JSON.stringify({
    version: 1,
    seed: 4242,
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
  await page.goto('/Kinetic_Curator/', { waitUntil: 'domcontentloaded' });
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

// Drives the real UI: OUTPUT tab -> AUTO off -> REC -> wait -> STOP -> blob.
async function recordWebM(page, fade, secs) {
  await seedDoc(page, fade);
  await page.getByRole('tab', { name: /output/i }).click();
  await page.locator('.panel-output').waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: /AUTO/ }).click();
  await page.waitForTimeout(3000); // let trails build up
  await page.getByRole('button', { name: /REC WEBM/ }).click();
  await page.waitForTimeout(secs * 1000);
  await page.getByRole('button', { name: /STOP REC/ }).click();
  await page.waitForFunction(() => window.__webmBlobs.length > 0, null, { timeout: 15_000 });
  const bytes = await page.evaluate(async () => {
    const blob = window.__webmBlobs[window.__webmBlobs.length - 1];
    return {
      size: blob.size,
      type: blob.type,
      data: Array.from(new Uint8Array(await blob.arrayBuffer())),
    };
  });
  return { size: bytes.size, type: bytes.type, buffer: Buffer.from(bytes.data) };
}

// Decodes the captured WebM in-page (video + requestVideoFrameCallback) and
// returns the mean consecutive-frame difference — the trail-decay signal.
async function analyzeWebM(page) {
  return page.evaluate(async () => {
    const blob = window.__webmBlobs[window.__webmBlobs.length - 1];
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.src = url;
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
      const onFrame = () => {
        ctx.drawImage(video, 0, 0, W, H);
        frames.push(ctx.getImageData(0, 0, W, H).data.slice());
        if (frames.length >= 30) res();
        else video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
      video.play().catch(() => res());
      setTimeout(res, 25_000);
    });
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
    return { frames: frames.length, meanDiff: mean };
  });
}

test('REC WebM records the ACCUM trail buffer (fade differential)', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await installBlobTap(page);

  const hi = await recordWebM(page, 0.88, 10);
  expect(hi.type).toMatch(/webm/);
  expect(hi.size).toBeGreaterThan(10_000);
  const hiStats = await analyzeWebM(page);
  await testInfo.attach('rec-fade-0.88.webm', { body: hi.buffer, contentType: 'video/webm' });

  const lo = await recordWebM(page, 0.98, 10);
  expect(lo.type).toMatch(/webm/);
  expect(lo.size).toBeGreaterThan(10_000);
  const loStats = await analyzeWebM(page);
  await testInfo.attach('rec-fade-0.98.webm', { body: lo.buffer, contentType: 'video/webm' });

  // Both recordings must contain a real frame sequence.
  expect(hiStats.frames).toBeGreaterThanOrEqual(6);
  expect(loStats.frames).toBeGreaterThanOrEqual(6);

  // The trail buffer's per-frame fade is the dominant frame-to-frame change
  // at 0.88; at 0.98 the same trails barely decay. Only the ACCUM fade
  // differs between the two recordings, so this differential is the trail
  // buffer's signature inside the recorded stream.
  expect(hiStats.meanDiff).toBeGreaterThan(5);
  expect(hiStats.meanDiff).toBeGreaterThan(loStats.meanDiff * 2);
});
