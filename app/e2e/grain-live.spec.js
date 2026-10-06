// #1069 — grain is drawn on the live canvas with ACCUM off (the default).
// Before the fix, the finish chain was applied only on the accumulation path, so
// adding GRAIN moved the slider and changed nothing on screen.
import { test, expect } from '@playwright/test';

// High-frequency energy of the canvas as the browser shows it: mean |pixel - mean of
// its 4 neighbours| on a screenshot of the GL canvas. Film grain is high-frequency
// noise, so it multiplies this number. A screenshot goes through the compositor, so
// it works wherever the page does; reading the WebGL drawing buffer from a
// requestAnimationFrame callback returned an all-zero buffer on CI's software GL
// (baseline 0.000) even though it worked locally, because a WebGL canvas reads back
// blank once the frame has been composited.
async function hfEnergy(page) {
  const png = await page.locator('canvas.canvas-gl').screenshot();
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
    const L = (x, y) => { const i = (y * width + x) * 4; return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; };
    let sum = 0; let n = 0;
    for (let y = 1; y < height - 1; y += 2) for (let x = 1; x < width - 1; x += 2) {
      sum += Math.abs(L(x, y) - (L(x - 1, y) + L(x + 1, y) + L(x, y - 1) + L(x, y + 1)) / 4);
      n++;
    }
    return sum / n;
  }, png.toString('base64'));
}

async function avgEnergy(page, frames = 3) {
  let total = 0;
  for (let i = 0; i < frames; i++) { total += await hfEnergy(page); await page.waitForTimeout(150); }
  return total / frames;
}

test('adding GRAIN visibly changes the canvas with ACCUM off', async ({ page }) => {
  test.setTimeout(120_000); // software GL renders every frame on the CPU
  // The governor's AUTO quality is seeded OFF in the project doc, exactly as the other
  // GL specs do (accum-recording, loop-capture): on software GL (SwiftShader, CI
  // runners) its watchdog hard-stops the render loop, the canvas freezes, and a test
  // that waits for it to change waits forever. That is the app working as designed,
  // not what this test measures.
  await page.goto('/?boot=factory', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.setItem('kc:first-run-seen', '1');
    localStorage.setItem('kc:project:v1', JSON.stringify({
      version: 1, savedAt: new Date().toISOString(),
      doc: { version: 1, seed: 4242, autoQuality: false, layoutParams: { mode: 'swarm', count: 12 } }, // few nodes: the test is about grain, not load
    }));
  });
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /build/i }).click();
  await page.waitForTimeout(800); // let the first frames land

  const before = await avgEnergy(page);
  expect(before, 'the canvas rendered something before grain was added').toBeGreaterThan(0.05);

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
