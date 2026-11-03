// engine/creatureRig.js — #1851 (creatures, slice 3: body language) — the creature RIG.
//
// Matt's ruling (2026-11-02, on #1851): the head and limbs are INVISIBLE animation bones (a cut-out rig, as in Spine
// or Godot's 2D skeletons), not drawn parts. The visible parts come from the asset pool:
//
//   1. parts are DEALT FROM THE STAGE — each bone carries a pool asset chosen from the shapes the stage is already
//      placing, so the creature is made of the room's own material (and the room's colours) and redresses when the
//      stage changes;
//   2. RIGID CUT-OUT — each part turns stiffly about its joint, child bones follow their parent (forward kinematics);
//   3. CHAINS — a limb is 2 bones (thigh, shin), 3 when a plain ATTACH point is put to it (it becomes the knee);
//   4. DAVIS PICKS, LOIS MOVES — Davis deals which asset rides which bone (dealPart); Lois's gait table sets the
//      motion: stride speed, swing, knee, head and posture (LOIS_GAITS).
//
// The pool tile (creatureTile, in the assembler) draws only the body and carries its bones as data (`rig`). At contract
// time (gl/sceneContract.js, every frame, the one seam every render path shares — live loop, GL stills, exports) a
// placed creature tile expands into its body + one ordinary instance per bone (expandCreatureInstances). The parts are
// honest instances: the atlas bakes them, the governor counts them, takes record them. Nothing in the resolver, the
// renderer, or the loop knows a creature exists.
//
// Units: the tile's 100-unit box, y down, angles in degrees clockwise (the SVG / contract convention). Browser-safe,
// pure, deterministic: same record → same bones; same seed + same stage → same parts; same time → same pose.

/** Where the body sits inside the tile's 100-unit box: small enough that the bones have room to reach. */
export const TILE_BODY_SCALE = 0.55;
const OFF = (100 * (1 - TILE_BODY_SCALE)) / 2;
/** How far a limb chain reaches from its root, and how long the head bone is (tile units). */
export const LIMB_REACH = 36;
export const HEAD_LEN = 14;
/** At most this many bones in one rig (4 ATTACH points max → head 1 + limbs up to 3 bones each). */
export const MAX_BONES = 12;
/** A part's size along its bone: the part's 100-unit box spans this much of the bone's length. */
const PART_FILL = 1.7;

const r3 = (n) => Math.round(n * 1000) / 1000;
const toTile = (p) => ({ x: OFF + p.x * TILE_BODY_SCALE, y: OFF + p.y * TILE_BODY_SCALE });
const deg = (rad) => (rad * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
function outwardDeg(p) {
  const dx = p.x - 50;
  const dy = p.y - 50;
  return Math.hypot(dx, dy) > 1 ? deg(Math.atan2(dy, dx)) : 90; // the centre itself points down
}

/** FNV-1a over a string — the house's seedable string hash shape (no Math.random anywhere). */
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
const u01 = (str) => hash32(str) / 4294967296;

/**
 * The tile's SVG: the body asset's own drawing, scaled into the middle of the box. Nothing else is drawn — the bones
 * are invisible; their parts are dealt from the stage at contract time.
 */
export function creatureTileSvg(record, bodySvg) {
  if (!record || typeof bodySvg !== 'string' || !bodySvg) return null;
  return `<g transform="translate(${r3(OFF)} ${r3(OFF)}) scale(${TILE_BODY_SCALE})">${bodySvg}</g>`;
}

/**
 * The rig for a record: { bones: [{ id, role, chain, parent, x, y, angle, len }] }. A root bone (parent null) carries
 * its joint (x, y) on the body and its rest angle in the tile's frame; a child bone's angle is relative to its parent
 * and it hangs from the parent's tip. Bones are listed parents first.
 *
 *   head   one bone from the H point, pointing away from the body's centre.
 *   limbs  one chain per L point, rooted on it and reaching outward: thigh + shin, plus a third bone when a plain
 *          (joint) point is put to that limb — each plain point goes to the nearest L point, one per limb, so the
 *          artist's extra points become knees. Rest pose: the knee bends alternately left and right, so neighbours
 *          never mirror.
 */
export function buildRig(record) {
  if (!record || !Array.isArray(record.limbs)) return null;
  const bones = [];
  if (record.head) {
    const h = toTile(record.head);
    bones.push({
      id: 'h',
      role: 'head',
      chain: -1,
      parent: null,
      x: r3(h.x),
      y: r3(h.y),
      angle: r3(outwardDeg(record.head)),
      len: HEAD_LEN,
    });
  }
  const knees = new Array(record.limbs.length).fill(0);
  for (const j of record.joints || []) {
    let best = -1;
    let bd = Infinity;
    record.limbs.forEach((l, i) => {
      const d = (l.x - j.x) ** 2 + (l.y - j.y) ** 2;
      if (knees[i] === 0 && d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best >= 0) knees[best] = 1;
  }
  record.limbs.forEach((l, i) => {
    const root = toTile(l);
    const segs = 2 + knees[i];
    const len = r3(LIMB_REACH / segs);
    const bend = (i % 2 ? -1 : 1) * 24; // the knee's rest bend, alternating side
    for (let k = 0; k < segs; k++) {
      bones.push({
        id: `l${i}.${k}`,
        role: 'limb',
        chain: i,
        parent: k === 0 ? null : `l${i}.${k - 1}`,
        x: k === 0 ? r3(root.x) : 0,
        y: k === 0 ? r3(root.y) : 0,
        angle: r3(k === 0 ? outwardDeg(l) - bend / 2 : bend),
        len,
      });
    }
  });
  // the body's own asset id rides along: when the stage places nothing else (the creature soloed), Davis deals from
  // the shape the creature is made of
  return bones.length ? { body: String(record.body || ''), bones: bones.slice(0, MAX_BONES) } : null;
}

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
/**
 * The trust boundary for a tile's rig (the overlay door re-runs it on every load): bones with known shapes only,
 * parents listed before children, numbers inside sane bounds. Null when nothing valid remains.
 */
export function sanitizeRig(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.bones)) return null;
  const out = [];
  const seen = new Set();
  for (const b of raw.bones) {
    if (out.length >= MAX_BONES) break;
    if (!b || typeof b !== 'object' || typeof b.id !== 'string' || !/^(h|l\d\.\d)$/.test(b.id) || seen.has(b.id))
      continue;
    if (b.role !== 'head' && b.role !== 'limb') continue;
    if (b.parent !== null && !seen.has(b.parent)) continue;
    if (![b.chain, b.x, b.y, b.angle, b.len].every(isNum)) continue;
    if (b.x < -50 || b.x > 150 || b.y < -50 || b.y > 150 || b.len <= 0 || b.len > 100 || Math.abs(b.angle) > 720)
      continue;
    seen.add(b.id);
    out.push({ id: b.id, role: b.role, chain: b.chain, parent: b.parent, x: b.x, y: b.y, angle: b.angle, len: b.len });
  }
  if (!out.length) return null;
  const body = typeof raw.body === 'string' && raw.body.length <= 120 && !/[<>"'&]/.test(raw.body) ? raw.body : '';
  return { body, bones: out };
}

/** #1947 — a tile's family: the founder record id its skeleton descends from (cr-xxxxxxxx), or null. */
export const sanitizeKin = (raw) => (typeof raw === 'string' && /^cr-[0-9a-f]{8}$/.test(raw) ? raw : null);
/** The shimmer's depth: at most this much opacity dips at the trough (subtle — ruling 4). */
export const SHIMMER_DEPTH = 0.12;
/**
 * #1947 — the family shimmer: a faint opacity pulse whose period and phase come from the family key alone, so kin on
 * stage breathe in unison and strangers do not. 1 at the crest, 1 - SHIMMER_DEPTH at the trough.
 */
export function kinShimmer(family, t) {
  const period = 2.6 + 1.4 * u01(`kin-period|${family}`);
  const phase = u01(`kin-phase|${family}`);
  return 1 - SHIMMER_DEPTH * (0.5 + 0.5 * Math.sin(2 * Math.PI * ((Number(t) || 0) / period + phase)));
}

/**
 * LOIS's gait table — how the creatures move in each of her moods (curator/loisFace.js codes). period = one stride
 * (s); swing = the thigh's swing (±°); knee = the lower bones' flex (±°); head = the head's look about (±°);
 * crouch = the rest bend's multiplier (posture: >1 hunched, <1 reaching). NOD is the default walk.
 */
export const LOIS_GAITS = Object.freeze({
  NOD: Object.freeze({ period: 1.4, swing: 22, knee: 26, head: 12, crouch: 1 }),
  VIBE: Object.freeze({ period: 0.9, swing: 30, knee: 34, head: 18, crouch: 0.8 }),
  BURN: Object.freeze({ period: 0.6, swing: 36, knee: 42, head: 22, crouch: 1.3 }),
  CUT: Object.freeze({ period: 2.2, swing: 10, knee: 12, head: 6, crouch: 1.4 }),
  AWAY: Object.freeze({ period: 3.0, swing: 6, knee: 8, head: 24, crouch: 1 }),
});
export const DEFAULT_GAIT = 'NOD';
/** The gait for a face code; unknown or absent → the default walk. */
export const gaitFor = (face) => LOIS_GAITS[face] || LOIS_GAITS[DEFAULT_GAIT];

/**
 * Pose a rig at time t (seconds): every bone's world joint, tip and angle in the tile's frame. Forward kinematics —
 * a child hangs from its parent's tip and adds its own angle to its parent's. `phase` (0..1) offsets this copy's
 * stride, so a herd of one creature never walks in lockstep. Chains alternate half a stride apart (a gait); each
 * bone down a chain lags its parent by a quarter-stride (the knee follows the hip). t = 0 / a frozen frame → the rest
 * pose, bent by the gait's crouch.
 *
 * @returns {Array<{ id, role, x, y, tx, ty, angle, len }>} in the rig's order
 */
export function poseRig(rig, t, gait = gaitFor(null), phase = 0) {
  if (!rig || !Array.isArray(rig.bones)) return [];
  const byId = new Map();
  const out = [];
  const limbs = new Set(rig.bones.filter((b) => b.role === 'limb').map((b) => b.chain)).size || 1;
  const w = (2 * Math.PI * (Number(t) || 0)) / gait.period;
  for (const b of rig.bones) {
    let angle;
    let x;
    let y;
    if (b.role === 'head') {
      angle = b.angle + gait.head * Math.sin(w * 0.6 + 2 * Math.PI * phase + 1.3);
      x = b.x;
      y = b.y;
    } else {
      const depth = Number(b.id.split('.')[1]) || 0;
      const ph = 2 * Math.PI * (phase + b.chain / limbs) - depth * (Math.PI / 2);
      const swing = depth === 0 ? gait.swing : gait.knee;
      const rest = depth === 0 ? b.angle : b.angle * gait.crouch;
      const local = rest + swing * Math.sin(w + ph);
      const p = b.parent ? byId.get(b.parent) : null;
      angle = p ? p.angle + local : local;
      x = p ? p.tx : b.x;
      y = p ? p.ty : b.y;
    }
    const tx = x + Math.cos(rad(angle)) * b.len;
    const ty = y + Math.sin(rad(angle)) * b.len;
    const posed = { id: b.id, role: b.role, x, y, tx, ty, angle, len: b.len };
    byId.set(b.id, posed);
    out.push(posed);
  }
  return out;
}

/**
 * DAVIS deals the part for one bone: an asset from the stage's own placed shapes, by the seed and the creature's
 * identity — every copy of one creature on one stage wears the same parts (a species look), a new stage or a new seed
 * redresses it. The head and the limbs draw from the same pile; each bone gets its own deal, but a chain's bones are
 * dealt together (thigh, shin, foot of one limb share a hand) so a limb reads as one design.
 */
export function dealPart(stageAssets, seed, tileId, bone) {
  if (!stageAssets.length) return null;
  const hand = bone.role === 'head' ? 'h' : `l${bone.chain}`;
  const depth = bone.role === 'head' ? 0 : Number(bone.id.split('.')[1]) || 0;
  const base = Math.floor(u01(`davis|${seed >>> 0}|${tileId}|${hand}`) * stageAssets.length);
  // down a chain, Davis steps through the pile by a seeded stride — related parts, not one shape repeated
  const step = 1 + Math.floor(u01(`davis-step|${seed >>> 0}|${tileId}|${hand}`) * Math.max(1, stageAssets.length - 1));
  return stageAssets[(base + depth * step) % stageAssets.length];
}

/**
 * The contract-time expansion: every placed creature tile (an instance whose overlay record carries a rig) becomes
 * its body + one instance per bone. Limb parts draw behind the body, the head in front of it. A part takes the body's
 * layer, colours, opacity and blend — the stage dresses it — and sits along its bone (centred on the bone, its box
 * spanning PART_FILL of the bone's length, its "up" along the bone) through the body mark's own transform.
 *
 * The governor's rungs (the #1433 region ladder, the same flags): `frozen` holds the rest pose; `collapsed` drops the
 * parts — the body alone, the cheapest creature. No other stage shapes to deal from (the creature soloed) → Davis
 * deals from the creature's own body shape.
 *
 * @param {Array} instances the contract's instances (not mutated)
 * @param {Map<string, object>|null} overlayById customAssets by id
 * @param {{ seed: number, t: number, frozen: boolean, collapsed: boolean, face?: string }} opts
 * @returns {Array} the original array when nothing expands, else a new one
 */
export function expandCreatureInstances(
  instances,
  overlayById,
  { seed = 0, t = 0, frozen = false, collapsed = false, face = null } = {},
) {
  if (!overlayById || collapsed) return instances;
  const rigOf = (id) => {
    const rec = overlayById.get(id);
    return rec && rec.category === 'creature' && rec.source === 'wetlab' ? sanitizeRig(rec.rig) : null;
  };
  // #1947 — the family: the founder whose skeleton this creature carries (a founder is its own); its parts are dealt
  // by the founder's hand, so kin resemble each other, and kin shimmer together
  const familyOf = (id) => sanitizeKin(overlayById.get(id)?.kin) || String(id).replace(/^user:/, '');
  if (!instances.some((it) => rigOf(it.asset))) return instances;
  const stageAssets = [
    ...new Set(instances.map((it) => it.asset).filter((id) => !rigOf(id) && id !== 'creature')),
  ].sort();
  const gait = gaitFor(face);
  const out = [];
  for (const it of instances) {
    const rig = rigOf(it.asset);
    if (!rig) {
      out.push(it);
      continue;
    }
    // the stage's shapes; with none (the creature soloed), the shape it is made of; with neither, the body alone
    const pile = stageAssets.length ? stageAssets : rig.body && !rigOf(rig.body) ? [rig.body] : [];
    if (!pile.length) {
      out.push(it);
      continue;
    }
    const phase = u01(`lois|${it.key}|${it.seedOffset}`);
    const family = familyOf(it.asset);
    const hand = `user:${family}`; // a founder's own tile id — so a founder's deal is exactly what it always was
    const glow = frozen ? 1 : kinShimmer(family, t);
    const pose = poseRig(rig, frozen ? 0 : t, gait, phase);
    const th = rad(it.rotation);
    const co = Math.cos(th);
    const si = Math.sin(th);
    const flip = it.scaleX < 0 ? -1 : 1;
    const parts = pose.map((p) => {
      const bone = rig.bones.find((b) => b.id === p.id);
      const lx = ((p.x + p.tx) / 2 - 50) * it.scaleX;
      const ly = ((p.y + p.ty) / 2 - 50) * it.scaleY;
      const s = (p.len * PART_FILL) / 100;
      return {
        role: p.role,
        inst: {
          ...it,
          asset: dealPart(pile, seed, hand, bone),
          opacity: r3(it.opacity * glow),
          key: `${it.key}#${p.id}`,
          x: r3(it.x + lx * co - ly * si),
          y: r3(it.y + lx * si + ly * co),
          scaleX: r3(Math.abs(it.scaleX) * s * flip),
          scaleY: r3(it.scaleY * s),
          // the part's "up" (its box's -y) runs along the bone, root to tip
          rotation: r3(it.rotation + flip * (p.angle + 90)),
        },
      };
    });
    for (const p of parts) if (p.role === 'limb') out.push(p.inst);
    out.push(it);
    for (const p of parts) if (p.role === 'head') out.push(p.inst);
  }
  return out;
}
