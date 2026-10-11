// curator/autoAttach.js — #1355: attach points worked out from an asset's shape (Matt, 2026-10-11: every asset gets
// them without setup; a hand edit in the wet lab wins).
//
// Pure geometry, no DOM, no chance: the same markup always gives the same points, in the engine and in Node. The
// outline is sampled from the markup, and the points are the shape's four extremes (top, right, bottom, left):
// its tips and widest edges. Extremes that land on the same spot collapse, so a thin line gets two points, not four.
//
// ponytail: an elliptical arc (A) is read by its end point only, and a <g transform> is ignored (no built-in asset
// has one). 13 built-ins use arcs; if their points look wrong, flatten the arc here.
import { MAX_ATTACH, ATTACH_BOX, ATTACH_HIT, sanitizeAttachPoints } from './assetAttach.js';

const num = (s, name) => { const m = new RegExp(`\\s${name}="\\s*(-?[\\d.]+(?:e-?\\d+)?)`).exec(s); return m ? parseFloat(m[1]) : 0; };
const CURVE_STEPS = 8;

function pathPoints(d, out) {
  const tok = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [];
  let i = 0; let cmd = ''; let x = 0; let y = 0; let sx = 0; let sy = 0;
  const n = () => parseFloat(tok[i++]);
  const more = () => i < tok.length && !/[a-zA-Z]/.test(tok[i]);
  const curve = (pts) => { // de Casteljau samples of a bezier through pts (start first)
    for (let s = 1; s <= CURVE_STEPS; s++) {
      const t = s / CURVE_STEPS; let q = pts;
      while (q.length > 1) q = q.slice(1).map((p, k) => [q[k][0] + (p[0] - q[k][0]) * t, q[k][1] + (p[1] - q[k][1]) * t]);
      out.push(q[0]);
    }
  };
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++]; else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase(); const c = cmd.toUpperCase();
    const ox = rel ? x : 0; const oy = rel ? y : 0;
    if (c === 'Z') { x = sx; y = sy; continue; }
    if (!more()) continue;
    if (c === 'M' || c === 'L' || c === 'T') {
      x = ox + n(); y = oy + n(); out.push([x, y]);
      if (c === 'M') { sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
    } else if (c === 'H') { x = ox + n(); out.push([x, y]); }
    else if (c === 'V') { y = oy + n(); out.push([x, y]); }
    else if (c === 'C') { const p = [[x, y], [ox + n(), oy + n()], [ox + n(), oy + n()], [ox + n(), oy + n()]]; curve(p); [x, y] = p[3]; }
    else if (c === 'S' || c === 'Q') { const p = [[x, y], [ox + n(), oy + n()], [ox + n(), oy + n()]]; curve(p); [x, y] = p[2]; }
    else if (c === 'A') { i += 5; x = ox + n(); y = oy + n(); out.push([x, y]); }
    else i++;
  }
}

function elementPoints(tag, el) {
  const out = [];
  if (tag === 'path') { const m = /\sd="([^"]*)"/.exec(el); if (m) pathPoints(m[1], out); }
  else if (tag === 'circle' || tag === 'ellipse') {
    const cx = num(el, 'cx'); const cy = num(el, 'cy');
    const rx = tag === 'circle' ? num(el, 'r') : num(el, 'rx'); const ry = tag === 'circle' ? rx : num(el, 'ry');
    out.push([cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]);
  } else if (tag === 'rect') {
    const x = num(el, 'x'); const y = num(el, 'y'); const w = num(el, 'width'); const h = num(el, 'height');
    out.push([x, y], [x + w, y], [x + w, y + h], [x, y + h]);
  } else if (tag === 'line') out.push([num(el, 'x1'), num(el, 'y1')], [num(el, 'x2'), num(el, 'y2')]);
  else if (tag === 'polygon' || tag === 'polyline') {
    const m = /\spoints="([^"]*)"/.exec(el); const v = m ? (m[1].match(/-?[\d.]+/g) || []).map(parseFloat) : [];
    for (let k = 0; k + 1 < v.length; k += 2) out.push([v[k], v[k + 1]]);
  }
  const r = /\stransform="rotate\(\s*(-?[\d.]+)[\s,]*(-?[\d.]+)?[\s,]*(-?[\d.]+)?\s*\)"/.exec(el);
  if (r) {
    const a = (parseFloat(r[1]) * Math.PI) / 180; const cx = parseFloat(r[2]) || 0; const cy = parseFloat(r[3]) || 0;
    const cos = Math.cos(a); const sin = Math.sin(a);
    return out.map(([px, py]) => [cx + (px - cx) * cos - (py - cy) * sin, cy + (px - cx) * sin + (py - cy) * cos]);
  }
  return out;
}

const cache = new Map();

/** Up to MAX_ATTACH points for this markup, in order top, right, bottom, left. Never empty for real markup. */
export function autoAttachPoints(svg) {
  if (typeof svg !== 'string' || !svg) return [];
  const hit = cache.get(svg);
  if (hit) return hit;
  const pts = [];
  const body = svg.replace(/<defs[\s\S]*?<\/defs>/g, ''); // gradients and clips are not the outline
  for (const m of body.matchAll(/<(path|circle|ellipse|rect|line|polygon|polyline)\b[^>]*>/g)) {
    for (const p of elementPoints(m[1], m[0])) if (Number.isFinite(p[0]) && Number.isFinite(p[1])) pts.push(p);
  }
  const clamp = (v) => Math.min(ATTACH_BOX, Math.max(0, v));
  const out = [];
  // A shape with no readable outline (a text glyph) still takes part: one point, at the centre of its box.
  if (!pts.length) out.push({ x: ATTACH_BOX / 2, y: ATTACH_BOX / 2 });
  else {
    // Every sample tied at an extreme (a flat top edge has two corners there) is averaged: the point is the middle
    // of that edge, not one of its corners.
    const best = (score) => {
      const top = pts.reduce((m, p) => Math.max(m, score(p)), -Infinity);
      const tied = pts.filter((p) => top - score(p) <= 0.5);
      return [tied.reduce((a, p) => a + p[0], 0) / tied.length, tied.reduce((a, p) => a + p[1], 0) / tied.length];
    };
    for (const p of [best((q) => -q[1]), best((q) => q[0]), best((q) => q[1]), best((q) => -q[0])]) {
      const c = { x: clamp(p[0]), y: clamp(p[1]) };
      if (!out.some((o) => Math.hypot(o.x - c.x, o.y - c.y) <= ATTACH_HIT)) out.push(c);
    }
  }
  const res = Object.freeze(sanitizeAttachPoints(out).slice(0, MAX_ATTACH));
  if (cache.size > 2000) cache.clear();
  cache.set(svg, res);
  return res;
}

/** The points an asset uses: the artist's own if they edited it in the wet lab (even "none"), else the shape's. */
export function attachPointsFor(asset, assetAttach) {
  const own = asset && assetAttach ? assetAttach[asset.id] : undefined;
  return Array.isArray(own) ? own : autoAttachPoints(asset?.svg);
}
