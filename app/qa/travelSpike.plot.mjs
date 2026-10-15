// #1573 — trail plot + motion metrics from qa-report/travel-spike/results.json (throwaway)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { APP } from './lib.mjs';

const OUT = join(APP, 'qa-report', 'travel-spike');
const { on } = JSON.parse(readFileSync(join(OUT, 'results.json'), 'utf8'));
const FRAME_S = 0.05; // one presented frame = the 50 ms dt clamp under software GL
const COL = { 0: '#e0457b', 1: '#2f7fe0', 2: '#8a8f98' };
let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700"><rect width="1000" height="700" fill="#14161a"/>';
const metrics = { marks: 0, perMark: [] };
for (const [key, tr] of Object.entries(on.trail)) {
  metrics.marks++;
  const [hx, hy] = tr[0];
  svg += `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="35" fill="none" stroke="#3a3f48" stroke-dasharray="3 4"/>`; // leash radius L
  svg += `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="2.5" fill="#cfd3da"/>`;
  let seg = [];
  const flush = (ph) => { if (seg.length > 1) svg += `<polyline points="${seg.join(' ')}" fill="none" stroke="${COL[ph]}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`; };
  let curPh = tr[0][4];
  let path = 0, held = 0, still = 0;
  let travelNet = [], travelLen = 0, startP = null;
  const speeds = [];
  for (let i = 0; i < tr.length; i++) {
    const [, , px, py, ph] = tr[i];
    if (i > 0) {
      const d = Math.hypot(px - tr[i - 1][2], py - tr[i - 1][3]);
      path += d; speeds.push(d / FRAME_S);
      if (ph === 2) held++;
      if (d / FRAME_S < 2) still++;
    }
    if (ph !== curPh) { flush(curPh); seg = seg.length ? [seg[seg.length - 1]] : []; curPh = ph; }
    seg.push(`${px.toFixed(1)},${py.toFixed(1)}`);
    if (ph === 1) { if (!startP) startP = [px, py]; travelLen += i > 0 ? Math.hypot(px - tr[i - 1][2], py - tr[i - 1][3]) : 0; travelNet = [px, py]; }
    else if (startP && travelNet.length) { metrics.perMark.push({ net: Math.hypot(travelNet[0] - startP[0], travelNet[1] - startP[1]), len: travelLen }); startP = null; travelLen = 0; travelNet = []; }
  }
  flush(curPh);
  svg += `<circle cx="${tr[tr.length - 1][2].toFixed(1)}" cy="${tr[tr.length - 1][3].toFixed(1)}" r="3.5" fill="#fff"/>`;
}
svg += '<text x="14" y="22" fill="#cfd3da" font-family="monospace" font-size="13">spike ON — trails per mark: pink=anticipation, blue=travel, grey=hold; dashed ring = leash L; dot = home</text></svg>';
writeFileSync(join(OUT, 'trails-on.svg'), svg);
writeFileSync(join(OUT, 'trails-on.png'), new Resvg(svg).render().asPng());
const segs = metrics.perMark.filter((s) => s.len > 4);
const straight = segs.map((s) => s.net / s.len).sort((a, b) => a - b);
const med = (a) => (a.length ? a[Math.floor(a.length / 2)] : null);
console.log(JSON.stringify({ marks: metrics.marks, travelSegments: segs.length, straightnessMedian: med(straight), straightnessNote: '1.0 = straight line; lower = arc' }, null, 1));
