// AUDIT (read-only) — Level 2: live-loop buffer persistence in the REAL app
// (built dist of aedccbe0), driven exactly like e2e/accum-recording.spec.js:
// a project doc is seeded into localStorage (kc:project:v1) and the app is
// reloaded on ?boot=factory. Frames are pulled from the canvas's own
// captureStream via ImageCapture (Playwright screenshots starve behind a
// live SwiftShader loop in this sandbox — the compositor capture never
// returns; the stream path is the one round 1 proved). Every frame is
// stamped with a rAF counter installed before boot, so decay is fitted per
// PRESENTED FRAME, not per wall second. No app code is touched; the
// preview server is spawned and killed here.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const SHOTS = new URL('../../kc-accum-audit2-shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const PORT = 4173;
// Direct 127.0.0.1 navigation: Playwright's bundled Chromium reaches it
// (the glDriver harness pages do the same), and 127.0.0.1 is a SECURE
// CONTEXT — ImageCapture is undefined on a fake intercepted host.
const HOST = `http://127.0.0.1:${PORT}`;
const APP_DIR = process.env.KC_APP_DIR || new URL('../app', import.meta.url).pathname;
const TAG = process.env.KC_TAG || '';

const preview = spawn(
  process.execPath,
  [`${APP_DIR}/node_modules/vite/bin/vite.js`, 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: APP_DIR, stdio: 'pipe' },
);
await new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('preview server did not start')), 30000);
  const check = async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/Kinetic_Curator/`);
      if (r.ok) {
        clearTimeout(to);
        res();
        return;
      }
    } catch {}
    setTimeout(check, 400);
  };
  check();
});
console.log('preview up');

const docFor = (lp) =>
  JSON.stringify({
    version: 1,
    seed: 4242,
    autoQuality: false, // per e2e: software-GL watchdog would hard-stop the loop
    layoutParams: { mode: 'swarm', count: 24, ...lp },
  });

const STATES = {
  'a-leave-3f': { accumulation: true, accumulationFade: 3.0, trail: 'leave', leaveFade: 0.05, echoes: 0 },
  'c-ribbon-3f': { accumulation: true, accumulationFade: 3.0, trail: 'ribbon', echoes: 0 },
  'd-plain-5f4': { accumulation: true, accumulationFade: 5.4, trail: 'accum', echoes: 0 },
  'off-control': { accumulation: false, accumulationFade: 5.4, trail: 'accum', echoes: 0 },
};

// In-page frame grabber: captureStream + ImageCapture, PNG per frame.
const GRAB_FN = `
window.__kcGrabSetup = () => {
  const canvas = document.querySelector('canvas');
  const stream = canvas.captureStream(30);
  const track = stream.getVideoTracks()[0];
  window.__kcIC = new ImageCapture(track);
  window.__kcCanvasSize = canvas.width + 'x' + canvas.height;
};
window.__kcGrab = async () => {
  const bmp = await Promise.race([
    window.__kcIC.grabFrame(),
    new Promise((r) => setTimeout(() => r(null), 6000)),
  ]);
  if (!bmp) return null;
  // Thumbnail to 500 px wide: the PNG encode is main-thread work in-page,
  // and a heavy burst can collapse fps and re-trip the watchdog.
  const tw = 500;
  const th = Math.round((tw * bmp.height) / bmp.width);
  const oc = new OffscreenCanvas(tw, th);
  oc.getContext('2d').drawImage(bmp, 0, 0, tw, th);
  bmp.close();
  const blob = await oc.convertToBlob({ type: 'image/png' });
  const buf = await blob.arrayBuffer();
  let bin = '';
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode(...u8.subarray(i, i + 32768));
  return btoa(bin);
};
window.__kcBurst = async (n) => {
  const out = [];
  window.__kcBurstProgress = out;
  for (let i = 0; i < n; i++) {
    const raf = window.__raf;
    const t = Date.now();
    const b64 = await window.__kcGrab();
    out.push({ i, raf, t, b64 });
    await new Promise((r) => setTimeout(r, 90));
  }
  return out;
};
window.__kcGrabHash = async () => {
  const bmp = await Promise.race([
    window.__kcIC.grabFrame(),
    new Promise((r) => setTimeout(() => r(null), 4000)),
  ]);
  if (!bmp) return null;
  const oc = new OffscreenCanvas(64, 48);
  oc.getContext('2d').drawImage(bmp, 0, 0, 64, 48);
  bmp.close();
  const d = oc.getContext('2d').getImageData(0, 0, 64, 48).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] * 3 + d[i + 2] * 7;
  return s;
};
`;

const only = process.env.KC_STATES ? process.env.KC_STATES.split(',') : null;
const browser = await chromium.launch();
try {
  for (const [rawName, lp] of Object.entries(STATES)) {
    if (only && !only.includes(rawName)) continue;
    const name = TAG ? `${TAG}-${rawName}` : rawName;
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 750 } });
    const page = await ctx.newPage();
    const consoleLog = [];
    page.on('console', (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => consoleLog.push(`[pageerror] ${e.message}`));
    await page.addInitScript(() => {
      window.__raf = 0;
      const loop = () => {
        window.__raf++;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.goto(`${HOST}/Kinetic_Curator/?boot=factory`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((doc) => {
      localStorage.setItem('kc:first-run-seen', '1');
      localStorage.setItem(
        'kc:project:v1',
        JSON.stringify({ version: 1, savedAt: new Date().toISOString(), doc: JSON.parse(doc) }),
      );
    }, docFor(lp));
    await page.reload({ waitUntil: 'load' });
    await page.locator('.app').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(3000);
    // Wake phase 1 (DOM): the watchdog's PERF PAUSED pill is DOM text.
    // Escape dismisses the living-boot overlay FIRST (a Space pressed
    // under the overlay is swallowed), then Space resumes the loop.
    // Repeat until the pill is gone from the document text.
    let live = false;
    let wakeTries = 0;
    let bodyText = '';
    for (; wakeTries < 5 && !live; wakeTries++) {
      await page.keyboard.press('Escape');
      await page.keyboard.press('Space');
      await page.waitForTimeout(700);
      bodyText = await page.evaluate(() => document.body.innerText);
      live = !/PERF PAUSED/i.test(bodyText);
    }
    // Wake phase 2 (stream): two frame hashes 800 ms apart should differ.
    await page.evaluate(GRAB_FN);
    await page.evaluate(() => window.__kcGrabSetup());
    const h1 = await page.evaluate(() => window.__kcGrabHash());
    await page.waitForTimeout(800);
    const h2 = await page.evaluate(() => window.__kcGrabHash());
    const streamLive = h1 !== null && h2 !== null && h1 !== h2;
    const canvasInfo = await page.evaluate(() => window.__kcCanvasSize);
    bodyText = await page.evaluate(() => document.body.innerText);
    console.log(`${name}: wakeTries=${wakeTries} pillGone=${live} streamLive=${streamLive} canvas=${canvasInfo}`);
    if (!live) console.log(`${name}: BODY: ${bodyText.slice(0, 600).replace(/\n/g, ' | ')}`);
    // Burst: in-page chunks of 12 grabs (per-grab CDP roundtrips starve
    // behind the live SwiftShader main thread), with a watchdog re-wake
    // check between chunks — a heavy burst can re-trip PERF PAUSED.
    const N = 48;
    const meta = [];
    let idx = 0;
    while (idx < N) {
      const bt = await page.evaluate(() => document.body.innerText);
      if (/PERF PAUSED/i.test(bt)) {
        await page.keyboard.press('Space');
        await page.waitForTimeout(600);
      }
      const chunk = await Promise.race([
        page.evaluate((n) => window.__kcBurst(n), Math.min(12, N - idx)),
        new Promise((_, rej) => setTimeout(() => rej(new Error('burst chunk timed out')), 150_000)),
      ]);
      for (const f of chunk) {
        if (f.b64) writeFileSync(`${SHOTS}app-${name}-${String(idx).padStart(2, '0')}.png`, Buffer.from(f.b64, 'base64'));
        meta.push({ i: idx, raf: f.raf, t: f.t, gap: !f.b64 });
        idx++;
      }
    }
    writeFileSync(
      `${SHOTS}app-${name}-meta.json`,
      JSON.stringify({ name, lp, meta, footer: bodyText, consoleLog, wakeTries, live, streamLive, canvasInfo }, null, 2),
    );
    console.log(
      `${name}: ${N} frames, raf ${meta[0].raf}..${meta[N - 1].raf} (${((meta[N - 1].raf - meta[0].raf) / ((meta[N - 1].t - meta[0].t) / 1000)).toFixed(1)} presented fps)`,
    );
    await ctx.close();
  }
} finally {
  await browser.close();
  preview.kill();
}
