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
 *
 * #419: the pairing is planned ONCE at transition start (planMorph) and
 * held for the whole MIX duration; each frame only resolves the plan's
 * target slots against its own live item list. Re-matching every frame
 * was O(n^2) per frame AND let near-tied pairs flip mid-flight when the
 * breathing layout (life drift, displacement warp) shifted a target —
 * items darted across their group instead of gliding one straight line.
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
 * Plan the from->to pairing ONCE at transition start (#419). Greedy
 * nearest within each asset group (O(n^2) per group — run once per chip
 * click, not once per frame). The target side is recorded as SLOTS
 * { g: assetGroupKey, j: original index } rather than object refs, so
 * every blend frame can resolve them against its own live target list:
 * life drift and the displacement warp move targets every frame, and the
 * pairing must not follow them.
 * Returns { pairs: [{ f, g, j }], onlyFrom: [items], onlyTo: [{ g, j }] }.
 */
export function planMorph(fromItems, toItems) {
  const fromGroups = groupByAsset(fromItems || []);
  const toGroups = groupByAsset(toItems || []);
  const pairs = [];
  const onlyFrom = [];
  const onlyTo = [];
  const allKeys = new Set([...fromGroups.keys(), ...toGroups.keys()]);

  const leftoverFrom = [];
  const leftoverTo = [];

  // Pass 1: exact same-asset nearest matching
  for (const k of allKeys) {
    const fs = (fromGroups.get(k) || []).slice();
    const ts = (toGroups.get(k) || []).map((item, origIdx) => ({ item, origIdx, g: k }));
    while (fs.length && ts.length) {
      let bi = 0, bj = 0, bd = Infinity;
      for (let i = 0; i < fs.length; i++) {
        for (let j = 0; j < ts.length; j++) {
          const d = dist2(fs[i], ts[j].item);
          if (d < bd) { bd = d; bi = i; bj = j; }
        }
      }
      pairs.push({ f: fs[bi], g: k, j: ts[bj].origIdx });
      fs.splice(bi, 1);
      ts.splice(bj, 1);
    }
    leftoverFrom.push(...fs);
    leftoverTo.push(...ts);
  }

  // Pass 2: cross-asset nearest spatial matching (Always Alive: no optical cross-fade dissolve)
  // When modes or stub chips use different asset sets, nodes physically travel across the
  // canvas to their nearest destination slot rather than dissolving in place.
  while (leftoverFrom.length && leftoverTo.length) {
    let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i < leftoverFrom.length; i++) {
      for (let j = 0; j < leftoverTo.length; j++) {
        const d = dist2(leftoverFrom[i], leftoverTo[j].item);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    pairs.push({ f: leftoverFrom[bi], g: leftoverTo[bj].g, j: leftoverTo[bj].origIdx });
    leftoverFrom.splice(bi, 1);
    leftoverTo.splice(bj, 1);
  }

  onlyFrom.push(...leftoverFrom);
  onlyTo.push(...leftoverTo.map((t) => ({ g: t.g, j: t.origIdx })));

  return { pairs, onlyFrom, onlyTo };
}

/**
 * Compat surface: materialize a plan into the original ref-tuple shape
 * ([[fromItem, toItem], ...]) against the same `to` it was built from.
 * Greedy order is unchanged, so results are identical to the pre-#419
 * matcher.
 */
export function matchItems(fromItems, toItems) {
  const plan = planMorph(fromItems, toItems);
  const toGroups = groupByAsset(toItems || []);
  return {
    pairs: plan.pairs.map(({ f, g, j }) => [f, toGroups.get(g)[j]]),
    onlyFrom: plan.onlyFrom,
    onlyTo: plan.onlyTo.map(({ g, j }) => toGroups.get(g)[j]),
  };
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
 *
 * `plan` is the planMorph() result captured at transition start (#419):
 * the pairing stays fixed for the whole transition while every slot
 * resolves against THIS frame's targets, so endpoints breathe with the
 * live layout but an item never changes target mid-flight. Omitted
 * (tests, one-shot blends) => a fresh plan, identical to the old
 * per-call match.
 *
 * #444: EMISSION ORDER = raw toItems order first, fade-outs appended last.
 * Draw order is array order (packInstanceData never re-sorts), and the
 * completion frame drops the blend and presents raw e.items — so the last
 * blend frame must already be in raw order or asset stacking flips in one
 * frame (the z-fight at the end of every chip change). Emitting pairs
 * group-by-group (allKeys = from-group keys first) reorders every time the
 * group order differs from the raw to order. Trailing fade-outs are ~0
 * alpha by then and vanish with the transition.
 */
export function blendItems(fromItems, toItems, t, plan = null) {
  if (t <= 0) return fromItems;
  if (t >= 1) return toItems;
  const { pairs, onlyFrom } = plan || planMorph(fromItems, toItems);
  const toList = toItems || [];
  const toGroups = groupByAsset(toList);
  const idxOf = new Map(toList.map((it, i) => [it, i]));
  const partner = new Array(toList.length).fill(null); // to-index -> matched from-item
  for (const { f, g, j } of pairs) {
    const to = toGroups.get(g)?.[j];
    if (!to) continue; // defensive: slot set shrank (shouldn't mid-transition)
    const i = idxOf.get(to);
    if (i === undefined || partner[i]) continue; // defensive: unresolvable / duplicate ref
    partner[i] = f;
  }
  const out = [];
  for (let i = 0; i < toList.length; i++) {
    const to = toList[i];
    const f = partner[i];
    if (f) {
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
    } else {
      out.push({ ...to, alpha: (Number.isFinite(to.alpha) ? to.alpha : 100) * t }); // unmatched target fades in (#444: in raw position)
    }
  }
  for (const f of onlyFrom) out.push({ ...f, alpha: (Number.isFinite(f.alpha) ? f.alpha : 100) * (1 - t) });
  return out;
}
