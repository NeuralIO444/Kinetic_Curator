/**
 * itemMorph.mjs — per-item transition between two resolved layer item
 * lists (chip clicks: mode, behave, palette, asset-set). Every particle
 * stays alive through a chip switch and tweens position/scale/rotation/
 * color toward its new layout, instead of the two rendered frames
 * cross-dissolving as pixels (that remains the live loop's fallback for
 * the atlas-bake-wait window and for manual voice-MIX scrubbing — see
 * liveLoop.mjs).
 *
 * There is no true cross-generator identity: grid, fibonacci, cellular
 * automaton, and the swarm physics each produce their own item set with
 * their own key scheme, so "item 5 in fibonacci mode" has no ground-truth
 * counterpart in cellular-automaton mode. matchItems() approximates
 * identity by pairing same-asset items by nearest on-screen distance
 * within each asset group — the same shape slides to its nearest new
 * slot rather than an arbitrary one.
 */

function dist2(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function groupByAsset(items) {
  const groups = new Map();
  for (const it of items) {
    const k = it.assetId || it.role || 'default';
    let g = groups.get(k);
    if (!g) { g = []; groups.set(k, g); }
    g.push(it);
  }
  return groups;
}

/**
 * Pair fromItems <-> toItems by nearest position within matching asset
 * groups (greedy, O(n^2) per group — swarm/placement counts run in the
 * hundreds, not thousands, so this stays cheap per transition frame).
 * Returns { pairs: [[fromItem, toItem], ...], onlyFrom, onlyTo }.
 */
export function matchItems(fromItems, toItems) {
  const fromGroups = groupByAsset(fromItems || []);
  const toGroups = groupByAsset(toItems || []);
  const pairs = [];
  const onlyFrom = [];
  const onlyTo = [];
  const allKeys = new Set([...fromGroups.keys(), ...toGroups.keys()]);
  for (const k of allKeys) {
    const fs = (fromGroups.get(k) || []).slice();
    const ts = (toGroups.get(k) || []).slice();
    while (fs.length && ts.length) {
      let bi = 0, bj = 0, bd = Infinity;
      for (let i = 0; i < fs.length; i++) {
        for (let j = 0; j < ts.length; j++) {
          const d = dist2(fs[i], ts[j]);
          if (d < bd) { bd = d; bi = i; bj = j; }
        }
      }
      pairs.push([fs[bi], ts[bj]]);
      fs.splice(bi, 1);
      ts.splice(bj, 1);
    }
    onlyFrom.push(...fs);
    onlyTo.push(...ts);
  }
  return { pairs, onlyFrom, onlyTo };
}

function lerp(a, b, t) { return a + (b - a) * t; }

/** Shortest-path angle interpolation (degrees) — 350deg -> 10deg turns +20, not -340. */
function lerpAngle(a, b, t) {
  const d = ((b - a) % 360 + 540) % 360 - 180;
  return a + d * t;
}

function hexToRgb(hex) {
  const h = String(hex || '#000000').replace('#', '');
  const v = h.length <= 4 ? h.slice(0, 3).split('').map((c) => c + c).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0);
}
function rgbToHex([r, g, b]) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function lerpColor(a, b, t) {
  if (!a || !b || a === b) return b || a;
  const ca = hexToRgb(a), cb = hexToRgb(b);
  return rgbToHex([lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t)]);
}

/**
 * Blend fromItems -> toItems at eased t in [0,1]. t<=0 returns fromItems
 * verbatim, t>=1 returns toItems verbatim (reference equality, so callers
 * can drop the transition once the blended list === toItems). A matched
 * pair keeps the TARGET item's identity (asset, role, key, u, ...) and
 * only tweens x/y/scale/rotation/alpha/color/accent; an unmatched target
 * item fades in, an unmatched source item fades out.
 */
export function blendItems(fromItems, toItems, t) {
  if (t <= 0) return fromItems;
  if (t >= 1) return toItems;
  const { pairs, onlyFrom, onlyTo } = matchItems(fromItems, toItems);
  const out = [];
  for (const [f, to] of pairs) {
    out.push({
      ...to,
      x: lerp(f.x, to.x, t),
      y: lerp(f.y, to.y, t),
      scale: lerp(Number(f.scale) || 1, Number(to.scale) || 1, t),
      rotation: lerpAngle(Number(f.rotation) || 0, Number(to.rotation) || 0, t),
      alpha: lerp(Number.isFinite(f.alpha) ? f.alpha : 100, Number.isFinite(to.alpha) ? to.alpha : 100, t),
      color: lerpColor(f.color, to.color, t),
      accent: lerpColor(f.accent, to.accent, t),
    });
  }
  for (const f of onlyFrom) out.push({ ...f, alpha: (Number.isFinite(f.alpha) ? f.alpha : 100) * (1 - t) });
  for (const to of onlyTo) out.push({ ...to, alpha: (Number.isFinite(to.alpha) ? to.alpha : 100) * t });
  return out;
}
