// e2e/loop-capture.spec.js — #284: CAPTURE LOOP exports a fixed-length,
// seamless-looping WebM.
//
// What this proves (and how): drives the real UI (OUTPUT tab -> 2s ->
// CAPTURE LOOP), taps the downloaded WebM blob via URL.createObjectURL,
// then decodes it in-page. Assertions:
//   1. the blob is a real WebM of non-trivial size (the recorder ran —
//      note: on software GL the captured frames can be near-black, which
//      VP9 compresses to almost nothing, so the bar here is "a real file
//      was encoded", not "a big file"),
//   2. the decoded duration is ~2s (fixed-length take — the N in "N-second
//      capture" is honored),
//   3. the stream contains a real frame sequence (>= 6 frames).
//
// Seamlessness itself is structural (the tail dissolves into the pre-roll
// head before encoding, and the loop point lands on consecutive recorded
// frames) and is pinned by src/hooks/useLoopCapture.selfcheck.mjs —
// decoding a pixel-perfect seam assertion out of a VP9 stream would be
// flaky by construction.
//
// The governor's AUTO quality is switched off for this test: on software GL
// (SwiftShader, CI runners) the watchdog would hard-stop the render loop,
// which is the app working as designed, not what this test measures.

import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

const docFor = () =>
  JSON.stringify({
    version: 1,
    seed: 284284,
    layoutParams: { mode: 'swarm', count: 60, accumulation: true, accumulationFade: 17 },
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

test('CAPTURE LOOP exports a fixed-length seamless-loop WebM', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await installBlobTap(page);

  await page.goto('/Kinetic_Curator/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((doc) => {
    localStorage.setItem('kc:first-run-seen', '1');
    localStorage.setItem(
      'kc:project:v1',
      JSON.stringify({ version: 1, savedAt: new Date().toISOString(), doc: JSON.parse(doc) }),
    );
  }, docFor());
  await page.reload({ waitUntil: 'load' });
  await page.locator('.app').waitFor({ timeout: 30_000 });

  // OUTPUT tab -> AUTO off -> 2s loop -> CAPTURE LOOP -> wait for the blob.
  await page.getByRole('tab', { name: /output/i }).click();
  await page.locator('.panel-output').waitFor({ timeout: 10_000 });
  await page.getByRole('button', { name: /AUTO/ }).click();
  await page.waitForTimeout(2000); // let trails build up
  await page.getByRole('button', { name: /^2s$/ }).click();
  await page.getByRole('button', { name: /CAPTURE LOOP/ }).click();
  // 2s loop + 1s dissolve lead-in, plus encode/finalize headroom.
  await page.waitForFunction(() => window.__webmBlobs.length > 0, null, { timeout: 30_000 });

  const rec = await page.evaluate(async () => {
    const blob = window.__webmBlobs[window.__webmBlobs.length - 1];
    return {
      size: blob.size,
      type: blob.type,
      data: Array.from(new Uint8Array(await blob.arrayBuffer())),
    };
  });
  expect(rec.type).toMatch(/webm/);
  expect(rec.size).toBeGreaterThan(1000);
  await testInfo.attach('loop-2s.webm', { body: Buffer.from(rec.data), contentType: 'video/webm' });

  const stats = await page.evaluate(async () => {
    const blob = window.__webmBlobs[window.__webmBlobs.length - 1];
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.src = url;
    await new Promise((res, rej) => {
      video.onloadedmetadata = res;
      video.onerror = () => rej(new Error('webm decode failed'));
    });
    const duration = video.duration;
    let frames = 0;
    await new Promise((res) => {
      const onFrame = () => {
        frames += 1;
        if (frames >= 30) res();
        else video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
      video.play().catch(() => res());
      setTimeout(res, 20_000);
    });
    URL.revokeObjectURL(url);
    return { frames, duration };
  });

  // Real frame sequence, fixed ~2s length.
  expect(stats.frames).toBeGreaterThanOrEqual(6);
  expect(stats.duration).toBeGreaterThan(1.5);
  expect(stats.duration).toBeLessThan(2.8);
});
