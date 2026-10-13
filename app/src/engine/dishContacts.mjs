// dishContacts.mjs — #1407 (petri dish A1): one shared grid across strata.
//
// #167 gave every ParticleSystem its own spatial hash, so strata collided
// only within their own kind — a PEARL ghosted through an EAVES. This module
// is the shared grid the CONTACTS.md follow-ups pointed at: ONE counting-sort
// hash spanning every enrolled system, ONE cross-strata contact pass over it.
//
// Session protocol (mirrors the shared scent field, #509): the resolver (or
// the bake driver in kernel/bake/dishBake.mjs) owns one session per document,
// enrols each live swarm stratum's system into it in stratum order, and arms
// it once per frame/step. The first enrolled system's update() to reach its
// contact point runs the pass — at that moment every other system still holds
// its end-of-last-step state, so the pass always reads one consistent
// snapshot — and disarms it. particles.js takes only the call site; all logic
// lives here. The session rides into update() spread-only via
// layoutParams.dishSession, never stored, never serialized.
//
// Scope (A1): cross-strata pairs get positional depenetration (always,
// mass-weighted — `mass` is the hit response, exactly as #167) and a bounce
// impulse when BOTH strata's contact modes are impulse modes (bounce/stick),
// with restitution averaged across the pair. swap/die/breed stay per-system
// (population state is per-system; dish ecology is C4), and repel stays
// per-system personal space. FX strata never enrol — they are the medium.
//
// Determinism (spec §7): pair-visit order is canonical — stratum order
// (the arming order), then particle index — via the same counting-sort
// construction as ParticleSystem._buildSpatialHash, scattered in canonical
// body order. No Math.random / Date.now anywhere in the pass. Contact
// offsets live only in the systems' live columns; buildPlacements never
// sees them, so golden placement hashes are untouched.
//
// Dish off: a session is armed only when at least two enrolled strata have
// contactRadius > 0. Every other configuration — no session, an unarmed
// session, a single contact stratum — leaves each system's own #167 pass
// exactly as it was, bit-identical. #1409 (A3) adds the artist's switch on
// top: the per-Look `dish` param gates enrolment itself (dishEnrolRadius),
// so OFF never enrols a radius and the session can never arm — the ghost
// stack, chosen per Look, with #167 per-system contacts untouched.

import { feedDishDeform } from './dishDeform.mjs'; // #1410 — the dent across the seam (feed call site below)

const TAU = Math.PI * 2;

/**
 * The one radius law (#1408, petri dish A2), shared by this pass and the
 * per-system pass in particles.js: a body's contact disc is
 *   base × liveScale × assetTrim
 * where `base` is the stratum's contactRadius (the px disc of a scale-1,
 * trim-1 mark), `liveScale` is the body's `scale` column — the live
 * attribute path, so growth, shrink, and the breath pulse size the disc
 * every frame — and `assetTrim` is the per-particle trim resolved from
 * the asset record's `radiusTrim` (default 1.0). A non-positive or
 * non-finite scale/trim reads as its neutral value's guard: scale falls
 * back to 1 (an unreadable size is a unit mark, not a ghost), trim to 1;
 * a scale of exactly 0 is a zero-size mark and honestly has no disc.
 * Pure function of state — no Math.random / Date.now.
 */
export function contactBodyRadius(base, scale, trim) {
  const s = Number.isFinite(scale) ? Math.max(0, scale) : 1;
  const t = Number.isFinite(trim) && trim > 0 ? trim : 1;
  return base * s * t;
}

/**
 * The enrolment radius for one stratum under the per-Look DISH switch
 * (#1409, petri dish A3). `dish === false` enrols 0: armDish then never
 * arms, the cross-strata pass never runs, and the stratum ghosts through
 * its neighbours exactly as it did before the dish existed — while its
 * own #167 per-system pass (which reads contactRadius inside
 * particles.js, not here) is untouched. Any other value — including an
 * absent key on a pre-A3 document — enrols the stratum's contactRadius:
 * ON is the default, per the ratified spec decision. The resolver and
 * the bake driver both enrol through this one gate, so live and bake
 * can never disagree about whether the dish exists.
 */
export function dishEnrolRadius(layoutParams) {
  if (!layoutParams || layoutParams.dish === false) return 0;
  return layoutParams.contactRadius || 0;
}

/**
 * One dish session. `entries` is enrolment order; `order` is the canonical
 * stratum order set by the most recent arm (layer ids / driver keys in
 * stack order). Entries whose key is absent from `order` sit the pass out
 * (hidden or removed strata), so visibility is the resolver's call.
 */
export function createDishSession() {
  return {
    entries: [],
    order: [],
    armed: false,
    _bySys: new Map(),
    _seq: 0,
    // Grid scratch, grown on demand and reused across passes.
    _bEntry: [],
    _bIdx: null,
    _bRad: null, // #1408 — per-body disc radius, parallel to _bIdx
    _cellOf: null,
    _cellStart: null,
    _fill: null,
    _order: null,
  };
}

/**
 * Enrol (or refresh) one stratum's body set. Called by the resolver for
 * every live swarm layer each frame, and once per layer by the bake driver.
 * `entry`: { key, sys, radius, restitution, contactMode, umask, organism }.
 */
export function enrolDishBody(session, { key, sys, radius, restitution, contactMode, umask, organism }) {
  let e = session._bySys.get(sys);
  if (!e) {
    e = { key, sys, seq: session._seq++ };
    session._bySys.set(sys, e);
    session.entries.push(e);
  }
  e.key = key;
  e.radius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const r = Number.isFinite(restitution) ? Math.min(1, Math.max(0, restitution)) : 0.5;
  e.mode = contactMode || 'none';
  e.impulse = e.mode === 'bounce' || e.mode === 'stick';
  e.restitution = e.mode === 'bounce' ? r : 0;
  e.umask = (umask ?? 0xffffffff) >>> 0;
  e.organism = !!organism;
  return e;
}

/** Release a stratum whose system is gone (resolver prune). */
export function releaseDishBody(session, sys) {
  const e = session._bySys.get(sys);
  if (!e) return;
  session._bySys.delete(sys);
  const at = session.entries.indexOf(e);
  if (at >= 0) session.entries.splice(at, 1);
}

/**
 * Arm the session for one frame/step with the canonical stratum order.
 * Arms only when at least two strata in that order have radius > 0 —
 * anything less is dish-off and every update stays bit-identical to #167.
 */
export function armDish(session, orderedKeys) {
  session.order = orderedKeys || [];
  const inOrder = new Set(session.order);
  let active = 0;
  for (const e of session.entries) {
    if (e.radius > 0 && inOrder.has(e.key)) active++;
  }
  session.armed = active >= 2;
  return session.armed;
}

function activeEntries(session) {
  const rank = new Map();
  session.order.forEach((k, i) => { if (!rank.has(k)) rank.set(k, i); });
  return session.entries
    .filter((e) => e.radius > 0 && rank.has(e.key))
    .sort((a, b) => (rank.get(a.key) - rank.get(b.key)) || (a.seq - b.seq));
}

/**
 * The cross-strata contact pass. Runs at most once per arm, triggered by
 * the first enrolled system's update() reaching its contact point; returns
 * true when this call consumed the arm. A caller that is not enrolled
 * leaves the arm for an enrolled system later in the frame.
 */
export function runDishContacts(session, callerSys) {
  if (!session || !session.armed) return false;
  if (!session._bySys.has(callerSys)) return false;
  session.armed = false;

  const active = activeEntries(session);
  if (active.length < 2) return true;

  // Flatten bodies in canonical order (stratum order, then particle index).
  let total = 0;
  for (const e of active) total += e.sys.n;
  if (total < 2) return true;

  const bEntry = session._bEntry;
  bEntry.length = 0;
  let bIdx = session._bIdx;
  if (!bIdx || bIdx.length < total) {
    bIdx = new Int32Array(total);
    session._bIdx = bIdx;
  }
  // #1408 — per-body disc radii (base × live scale × trim), computed once
  // per pass into scratch; maxR over bodies sizes the shared cell.
  let bRad = session._bRad;
  if (!bRad || bRad.length < total) {
    bRad = new Float64Array(total);
    session._bRad = bRad;
  }
  let maxR = 0;
  let nb = 0;
  for (let s = 0; s < active.length; s++) {
    const e = active[s];
    const sys = e.sys;
    for (let i = 0; i < sys.n; i++) {
      if (!sys.alive[i]) continue;
      const r = contactBodyRadius(e.radius, sys.scale[i], sys.contactTrim ? sys.contactTrim[i] : 1);
      bEntry.push(s);
      bIdx[nb] = i;
      bRad[nb] = r;
      if (r > maxR) maxR = r;
      nb++;
    }
  }
  if (nb < 2 || !(maxR > 0)) return true;

  // One shared counting-sort hash over all bodies — the same construction
  // as _buildSpatialHash (cell extent from the bodies, never clamped to
  // the canvas), scattered in canonical body order so within-cell order is
  // canonical too. Cell size 2*maxR covers every pair with rA + rB <= 2*maxR.
  const cellSize = maxR * 2;
  let cellOf = session._cellOf;
  if (!cellOf || cellOf.length < nb) {
    cellOf = new Int32Array(nb);
    session._cellOf = cellOf;
  }
  let minCx = Infinity; let minCy = Infinity;
  let maxCx = -Infinity; let maxCy = -Infinity;
  for (let b = 0; b < nb; b++) {
    const sys = active[bEntry[b]].sys;
    const cx = Math.floor(sys.x[bIdx[b]] / cellSize);
    const cy = Math.floor(sys.y[bIdx[b]] / cellSize);
    if (cx < minCx) minCx = cx;
    if (cx > maxCx) maxCx = cx;
    if (cy < minCy) minCy = cy;
    if (cy > maxCy) maxCy = cy;
  }
  const cols = maxCx - minCx + 1;
  const rows = maxCy - minCy + 1;
  const numCells = cols * rows;
  let cellStart = session._cellStart;
  if (!cellStart || cellStart.length < numCells + 1) {
    cellStart = new Int32Array(numCells + 1);
    session._cellStart = cellStart;
  } else {
    cellStart.fill(0, 0, numCells + 1);
  }
  for (let b = 0; b < nb; b++) {
    const sys = active[bEntry[b]].sys;
    const cx = Math.floor(sys.x[bIdx[b]] / cellSize) - minCx;
    const cy = Math.floor(sys.y[bIdx[b]] / cellSize) - minCy;
    const c = cy * cols + cx;
    cellOf[b] = c;
    cellStart[c + 1]++;
  }
  for (let c = 0; c < numCells; c++) cellStart[c + 1] += cellStart[c];
  let fill = session._fill;
  if (!fill || fill.length < numCells + 1) {
    fill = new Int32Array(numCells + 1);
    session._fill = fill;
  }
  fill.set(cellStart.subarray(0, numCells + 1));
  let order = session._order;
  if (!order || order.length < nb) {
    order = new Int32Array(nb);
    session._order = order;
  }
  for (let b = 0; b < nb; b++) order[fill[cellOf[b]]++] = b;

  // Pair loop: ascending canonical body order; per body the same
  // ox-outer/oy-inner 3x3 walk as the boids/contact loops; each unordered
  // cross-strata pair once, from the canonically lower body.
  for (let a = 0; a < nb; a++) {
    const ea = active[bEntry[a]];
    const sysA = ea.sys;
    const ia = bIdx[a];
    const ga = sysA.cgroup[ia];
    const cx = Math.floor(sysA.x[ia] / cellSize) - minCx;
    const cy = Math.floor(sysA.y[ia] / cellSize) - minCy;
    for (let ox = -1; ox <= 1; ox++) {
      const ncx = cx + ox;
      if (ncx < 0 || ncx >= cols) continue;
      for (let oy = -1; oy <= 1; oy++) {
        const ncy = cy + oy;
        if (ncy < 0 || ncy >= rows) continue;
        const c = ncy * cols + ncx;
        const end = cellStart[c + 1];
        for (let k = cellStart[c]; k < end; k++) {
          const b = order[k];
          if (b <= a) continue;
          const eb = active[bEntry[b]];
          if (eb === ea) continue; // same stratum: the system's own pass owns it
          const sysB = eb.sys;
          const ib = bIdx[b];
          const gb = sysB.cgroup[ib];
          // collideMask, generalised symmetrically: each stratum's mask
          // must admit both groups, exactly as the single-system rule
          // admits both pair members.
          if (!((ea.umask >>> ga) & 1) || !((ea.umask >>> gb) & 1)) continue;
          if (!((eb.umask >>> ga) & 1) || !((eb.umask >>> gb) & 1)) continue;
          // #1408 — per-body disc sum; both discs positive, or no contact
          // (the same edge rule as the per-system pass).
          const ra = bRad[a]; const rb = bRad[b];
          if (!(ra > 0) || !(rb > 0)) continue;
          const rr = ra + rb;
          const rr2 = rr * rr;
          // Re-read: a may already have moved this pass.
          const xi = sysA.x[ia]; const yi = sysA.y[ia];
          const dx = sysB.x[ib] - xi;
          const dy = sysB.y[ib] - yi;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr2) continue;
          let dist = Math.sqrt(d2);
          let nx; let ny;
          if (dist > 1e-9) {
            nx = dx / dist; ny = dy / dist;
          } else {
            // Exactly coincident discs: deterministic golden-angle normal
            // from the canonical pair identity — never NaN, never random.
            const sa = bEntry[a]; const sb = bEntry[b];
            const ang = ((sa * 131 + ia) * 2.399963229728653 + (sb * 131 + ib) * 1.2) % TAU;
            nx = Math.cos(ang); ny = Math.sin(ang);
            dist = 0;
          }
          const overlap = rr - dist;
          const m1 = sysA.mass[ia]; const m2 = sysB.mass[ib];
          const w1 = 1 / m1; const w2 = 1 / m2;
          const wSum = w1 + w2;
          // 1 — positional depenetration, mass-weighted. Always: bodies
          // occupy space across strata regardless of either mode.
          const corr = overlap / wSum;
          sysA.x[ia] = xi - nx * corr * w1;
          sysA.y[ia] = yi - ny * corr * w1;
          sysB.x[ib] = sysB.x[ib] + nx * corr * w2;
          sysB.y[ib] = sysB.y[ib] + ny * corr * w2;
          // 2 — bounce impulse on approach, only when both strata are
          // impulse modes; restitution is the pair's average (a stick
          // stratum contributes 0, so any pair touching one is inelastic
          // in proportion).
          let dvA = 0; let dvB = 0; // #1410 — per-body normal Δv, for the feed
          if (ea.impulse && eb.impulse) {
            const vn = (sysB.vx[ib] - sysA.vx[ia]) * nx + (sysB.vy[ib] - sysA.vy[ia]) * ny;
            if (vn < 0) {
              const e = (ea.restitution + eb.restitution) / 2;
              const jimp = (-(1 + e) * vn) / wSum;
              sysA.vx[ia] -= nx * jimp * w1;
              sysA.vy[ia] -= ny * jimp * w1;
              sysB.vx[ib] += nx * jimp * w2;
              sysB.vy[ib] += ny * jimp * w2;
              dvA = jimp * w1; dvB = jimp * w2;
            }
          }
          // #1410 — the dent across the seam: this resolution's impulse
          // + pressure feed both bodies' deform springs (law in
          // dishDeform.mjs). State only — the pass's positions and
          // velocities are already final for this pair.
          feedDishDeform(sysA, ia, sysB, ib, nx, ny, dvA, dvB, overlap, rr);
        }
      }
    }
  }

  // Organism bodies: depenetration moved heads after spines were built;
  // re-pin segment 0, the same correction the per-system pass applies.
  for (const e of active) {
    if (!e.organism) continue;
    const sys = e.sys;
    for (let s = 0; s < sys.n; s++) {
      if (!sys.alive[s]) continue;
      const sp = sys.spine[s];
      if (sp && sp.length) { sp[0].x = sys.x[s]; sp[0].y = sys.y[s]; }
    }
  }
  return true;
}
