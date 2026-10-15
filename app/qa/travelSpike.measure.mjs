// #1573 spike harness (throwaway): node qa/travelSpike.measure.mjs
// Software GL renders ~1.2 fps, so we record in SIM time: each presented frame advances the loop clock by
// its 50 ms clamp (3 fixed 1/60 steps). A rAF wrapper reads the canvas in the same task as the draw (so the
// drawing buffer is still live) once per presented frame; ffmpeg assembles a 20 fps clip. Same factory seed both runs.
// Output: qa-report/travel-spike/
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ensureServer, APP } from './lib.mjs';

const OUT = join(APP, 'qa-report', 'travel-spike');
mkdirSync(OUT, { recursive: true });
const SIM_MS = Number(process.env.SIM_MS || 10000);
const server = await ensureServer();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

async function session(label, on) {
  const frames = join(OUT, `frames-${label}`);
  rmSync(frames, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  let saved = 0, lastSimMs = 0;
  await page.exposeFunction('__saveFrame', (n, dataUrl, simMs) => {
    const b64 = dataUrl.split(',')[1];
    writeFileSync(join(frames, `f${String(n).padStart(4, '0')}.jpg`), Buffer.from(b64, 'base64'));
    saved = n + 1; lastSimMs = simMs;
  });
  await page.addInitScript(() => {
    try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ }
    window.__KC_GOVERNOR_OFF = true;
    const raf = window.requestAnimationFrame.bind(window);
    window.__cap = { on: false, last: -1, n: 0 };
    window.requestAnimationFrame = (cb) => raf((t) => {
      cb(t);
      const c = window.__cap; const g = globalThis.__travelSpike;
      if (c.on && g && g._calls !== c.last) {
        c.last = g._calls;
        const cv = document.querySelector('.panel-canvas canvas');
        if (cv) window.__saveFrame(c.n++, cv.toDataURL('image/jpeg', 0.92), g._nowAll);
      }
    });
  });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await page.goto(server.url + '?boot=factory', { waitUntil: 'domcontentloaded' });
  await page.locator('.app').waitFor({ timeout: 30000 });
  await page.waitForFunction(() => {
    const el = [...document.querySelectorAll('.panel-canvas .meter-pill')].find((e) => /NODES/i.test(e.textContent || ''));
    return el && parseInt(el.textContent, 10) > 0;
  }, null, { timeout: 60000 });
  const nodes = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.panel-canvas .meter-pill')].find((e) => /NODES/i.test(e.textContent || ''));
    return el ? el.textContent : '';
  });
  const t0 = await page.evaluate((o) => {
    const g = globalThis.__travelSpike; g.reset(); g.on = o; g.startRec();
    window.__cap.last = g._calls; window.__cap.on = true;
    return g._nowAll;
  }, on);
  const wall0 = Date.now();
  while (lastSimMs - t0 < SIM_MS) await new Promise((r) => setTimeout(r, 500));
  const res = await page.evaluate(() => {
    window.__cap.on = false;
    const g = globalThis.__travelSpike;
    return { stats: g.stats(), trail: g._trail, simEnd: g._nowAll };
  });
  const wallS = (Date.now() - wall0) / 1000;
  await ctx.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '20', '-i', join(frames, 'f%04d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(OUT, `clip-${label}.mp4`)]);
  return { label, nodes, logs, frames: saved, simMs: res.simEnd - t0, wallS, stats: res.stats, trail: res.trail };
}

let off, on;
try {
  off = process.env.ONLY_ON ? JSON.parse(readFileSync(join(OUT, 'results.json'), 'utf8')).off : await session('off', false);
  on = await session('on', true);
} finally { await browser.close(); server.stop(); }
writeFileSync(join(OUT, 'results.json'), JSON.stringify({ off, on }, null, 1));
const brief = (r) => ({ nodes: r.nodes, frames: r.frames, simMs: r.simMs, wallS: r.wallS, stats: r.stats, errors: r.logs.slice(0, 3) });
console.log(JSON.stringify({ off: brief(off), on: brief(on) }, null, 1));
