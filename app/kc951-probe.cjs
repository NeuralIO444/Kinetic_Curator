// Probe: capture the #951 hero-first beat-quantized transition on the live canvas.
// Records video + staged screenshots around a chip click that triggers an item morph.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));

  await page.goto('http://localhost:5173/Kinetic_Curator/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  // Dismiss the living-boot overlay (sets kc:first-run-seen).
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);

  const hash = await page.evaluate(() => document.querySelector('[data-build-hash]')?.dataset.buildHash
    || document.body.innerHTML.match(/build\s+([0-9a-f]{7})/)?.[1] || 'unknown');
  console.log('build hash in footer:', hash);

  // Let the piece settle, then screenshot the pre-transition state.
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/kc951-t0-settled.png' });

  // Start video recording via CDP screencast is complex; instead take a
  // rapid burst of screenshots across the transition to show the wave.
  // Click a BEHAVE chip to trigger an item morph (mode/behave/asset change).
  const chips = await page.$$('button');
  console.log('button count:', chips.length);

  // Find a behave/mode chip by visible text heuristics.
  const chipTexts = await page.$$eval('button', (els) => els.map((e) => (e.textContent || '').trim()).filter(Boolean).slice(0, 60));
  console.log('chips:', JSON.stringify(chipTexts.slice(0, 40)));

  await browser.close();
  console.log('page errors:', errors.length ? errors : 'none');
})().catch((e) => { console.error('PROBE FAIL:', e.message); process.exit(1); });
