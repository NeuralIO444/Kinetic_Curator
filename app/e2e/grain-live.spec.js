// #1069 — grain is drawn on the live canvas with ACCUM off (the default).
// Before the fix, the finish chain was applied only on the accumulation path, so
// adding GRAIN moved the slider and changed nothing on screen.
import { test, expect } from '@playwright/test';

// High-frequency energy of the frame the app just drew: mean |pixel - mean of its
// 4 neighbours| on the live GL canvas. Film grain is high-frequency noise, so it
// multiplies this number. The read happens in a requestAnimationFrame callback
// queued AFTER the app's own, so it sees this frame's drawing buffer (a WebGL
// canvas reads back blank once the frame has been composited). Reading the buffer
// rather than a screenshot also keeps the browser's downscaling from averaging the
// grain away.
async function hfEnergy(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const canvas = document.querySelector('canvas.canvas-gl');
    const gl = canvas.getContext('webgl2');
    const read = () => {
      const w = gl.drawingBufferWidth; const h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const L = (x, y) => { const i = (y * w + x) * 4; return 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; };
      let sum = 0; let n = 0;
      for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
        sum += Math.abs(L(x, y) - (L(x - 1, y) + L(x + 1, y) + L(x, y - 1) + L(x, y + 1)) / 4);
        n++;
      }
      resolve(sum / n);
    };
    requestAnimationFrame(() => requestAnimationFrame(read));
  }));
}

async function avgEnergy(page, frames = 3) {
  let total = 0;
  for (let i = 0; i < frames; i++) { total += await hfEnergy(page); await page.waitForTimeout(150); }
  return total / frames;
}

test('adding GRAIN visibly changes the canvas with ACCUM off', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  await page.waitForTimeout(800); // let the first frames land

  const before = await avgEnergy(page);

  // FX 1..4: the fourth track is the Finish family, which holds grain.
  const stack = page.locator('.build-layer-stack');
  const fxPlus = stack.locator('.layer-section').filter({ has: page.getByRole('button', { name: 'Add FX track' }) }).locator('.layer-add-btn');
  for (let i = 0; i < 4; i++) await fxPlus.click();
  const editor = stack.locator('.layer-row-fx .fx-editor');
  await expect(editor).toHaveCount(1); // FX 4 is selected, its editor is open
  await editor.locator('select').selectOption('grain');
  await editor.locator('.chip-btn').click();
  const slider = editor.locator('input[type=range]').first();
  await slider.evaluate((el) => {
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(el, '1');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Grain needs its LUT baked for the new FX layer first (async, off the frame
  // path), so poll for it rather than assuming it lands on the next frame.
  await expect.poll(
    async () => (await avgEnergy(page, 1)) / before,
    { message: `high-frequency energy never rose above 1.3x its ACCUM-off baseline (${before.toFixed(3)})`, timeout: 15_000, intervals: [500] },
  ).toBeGreaterThan(1.3);
});
