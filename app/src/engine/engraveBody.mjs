/**
 * engraveBody.mjs — Phase 2 S4: the ENGRAVING finish for the skeleton creature system.
 *
 * The reference plates (Matt's Haeckel specimens, 2026-10-16) carry their bodies in
 * engraved line-work: fine contour lines ruled ACROSS the body, following its curve.
 * This leaf is that finish, expressed the way the material leaves (plateBody /
 * washBody / stippleBody) express theirs: the definition lives ONCE here and is
 * consumed as (a) the GLSL chunk the quad shader compiles, (b) the JS mirror the
 * selfcheck proves the field against, and (c) the pure packer that turns a posed
 * skeleton into the per-instance data the shader reads.
 *
 * How the lines bind to the spine (the whole design):
 * - The skeleton's spine is a polyline of joints (engine/skeleton.js: spine bones,
 *   chain === null, tail -> head). The lines live in BODY SPACE: the fragment's
 *   position is measured in the body item's own quad frame (the vertex stage's
 *   `au` — asset units, centre 50, the same frame the atlas UV lives in), and the
 *   spine joints are converted into that same frame on the CPU (engraveDataFor).
 * - In the fragment, the closest point on the polyline gives an arc-length
 *   coordinate s and a lateral distance. Contour lines are the level sets of s
 *   at multiples of `spacing` — ruled across the body, perpendicular to the
 *   spine's local direction, so when a pose bends the spine (S5's wither curls
 *   the chains; any future pose that moves the joints) the line field bends
 *   with it, because the field is a function of the joints, not of the box.
 * - #1356 (the finishing look pass) adds the second body-space line family the
 *   creature-system plan names (§1.3: lines of constant "along" are SEAMS):
 *   two longitudinal seams at fixed lateral offsets from the spine
 *   (ENGRAVE_SEAM_OFFSETS), drawn at ENGRAVE_SEAM_REL of the contour strength.
 *   They ride the same closest-point walk (the signed lateral distance of the
 *   closest point), so they bend with the spine exactly as the contours do.
 *   The packed per-instance data is UNCHANGED (same joints, same params, the
 *   S4 golden stands): the seams are a shader/mirror term, not new data — a
 *   presentation-layer finish that moves no resolver output and no pin.
 * - Antialiasing is by `fwidth` on the line-distance field (core in GLSL ES
 *   3.00 — no extension), so line edges are one screen pixel wide on every
 *   device instead of a baked-in asset-unit width.
 * - The finish darkens the body item's own ink (a soft multiply inside the
 *   body's fragment, weighted by the body's coverage): the lines exist only
 *   where the body asset's alpha exists, exactly on its silhouette.
 *
 * Precision (Matt's S4 kill question — device divergence highp/quantisation
 * cannot fix): every quantity here is O(10^2) asset units in highp float32
 * (24-bit mantissa -> absolute error ~1e-5 units, five orders below the line
 * width); the field is built from dot products and one fract — no sin-hash,
 * no texture-size term, no mediump anywhere (QUAD_FS declares highp). The
 * only cross-device variable is rasterisation inside the AA band, where the
 * output is a CONTINUOUS function of position: a sub-ulp input difference
 * moves the factor by <1e-3, below the 16F->8-bit resolve step except for a
 * pixel sitting exactly on a rounding boundary — the same class the sun /
 * bevel terms already carry. Verdict: no divergence source found; kill
 * criterion NOT triggered. (Asserted in engraving.selfcheck by construction:
 * the JS mirror and the shader implement the same walk, and the packed
 * engraving data for a golden seed is hash-stable across repeated runs.)
 *
 * Cost: no pass, no texture, no per-frame CPU beyond the pack (16 floats on
 * the one body item per creature). The fragment term runs only on fragments
 * of engraved instances (gated on the joint count). Registered as
 * 'creature/engraving' in engine/kernel/costRegistry.mjs (the S4 append-only
 * block) and measured at the 4-creature cap in engraving.selfcheck.
 */

export const ENGRAVE_JOINTS = 6; // joints the attribute block carries (the moth spine: 5)
export const ENGRAVE_FLOATS = 16; // 6 joints x 2 + [count, spacing, width, strength]

/**
 * The finish's shipped constants (asset units — the body box is 100 units,
 * the quad spans 199.5): a ruled line every `spacing` units of spine arc,
 * `width` units wide at its centre, darkening the ink by up to `strength`
 * (a multiply factor of 1 - strength at line centre). Named so Matt's
 * review can move the look the way creature.js's MOTH constants move.
 */
export const ENGRAVE_DEFAULTS = Object.freeze({
  spacing: 8, // asset units of spine arc between lines (~16 lines over a full body)
  width: 1.5, // asset units, full width of a line at its centre
  strength: 0.55, // 0 = no finish, 1 = lines multiply to black
});

/** #1356 — the longitudinal seam offsets (asset units of signed lateral distance from the spine)
 *  and their strength relative to the contour lines. Constants of the finish, not packed data. */
export const ENGRAVE_SEAM_OFFSETS = Object.freeze([5.5, 11]);
export const ENGRAVE_SEAM_REL = 0.55;

const rad = (deg) => (deg * Math.PI) / 180;
const finite = (v, d) => (Number.isFinite(v) ? v : d);

/**
 * The spine's joints from a built skeleton, tail -> head: the spine bones'
 * bases plus the last bone's tip. Bones are in construction order with the
 * spine first (skeleton.js), identified by chain === null.
 */
export function spineJointsOf(skeleton) {
  const bones = ((skeleton && skeleton.bones) || []).filter((b) => b && b.chain === null);
  if (!bones.length) return [];
  const joints = [{ x: bones[0].base.x, y: bones[0].base.y }];
  for (const b of bones) joints.push({ x: b.tip.x, y: b.tip.y });
  return joints;
}

/**
 * Pack one creature's engraving data: the WORLD skeleton's spine joints in
 * the drawn body item's own quad frame (asset units, centre 50 — the frame
 * QUAD_VS calls `au`), plus [count, spacing, width, strength].
 *
 * The item transform is the expanded hierarchy item's ({x, y, scaleX,
 * scaleY, rotation} — world placement of the body stamp). The vertex stage
 * computes world = pos + R(rot) * ((au - 50) * scale); this is its exact
 * inverse, so the joints land in the same numbers the fragment interpolates.
 *
 * Returns a plain Array(ENGRAVE_FLOATS) of numbers, or null when there is
 * nothing to engrave (no skeleton, a spine under 2 joints, a degenerate
 * item transform) — null means the item carries no engraving, and every
 * downstream surface (contract, packer, shader) treats absence as the
 * pre-S4 path, byte for byte.
 */
export function engraveDataFor(skeleton, item, params = ENGRAVE_DEFAULTS) {
  if (!skeleton || !item) return null;
  const joints = spineJointsOf(skeleton);
  if (joints.length < 2) return null;
  const sx = finite(item.scaleX, 0);
  const sy = finite(item.scaleY, 0);
  if (sx === 0 || sy === 0 || !Number.isFinite(item.x) || !Number.isFinite(item.y)) return null;
  const th = rad(finite(item.rotation, 0));
  const co = Math.cos(th);
  const si = Math.sin(th);
  const out = new Array(ENGRAVE_FLOATS).fill(0);
  const n = Math.min(joints.length, ENGRAVE_JOINTS);
  let last = null;
  for (let k = 0; k < ENGRAVE_JOINTS; k++) {
    const w = joints[Math.min(k, n - 1)]; // pad by repeating the head joint; the shader stops at count
    const dx = w.x - item.x;
    const dy = w.y - item.y;
    // R^-1 (transpose of the y-down rotation) then the per-axis scale, then centre on 50.
    last = {
      x: 50 + (dx * co + dy * si) / sx,
      y: 50 + (-dx * si + dy * co) / sy,
    };
    out[k * 2] = last.x;
    out[k * 2 + 1] = last.y;
  }
  out[12] = n;
  out[13] = finite(params && params.spacing, ENGRAVE_DEFAULTS.spacing);
  out[14] = finite(params && params.width, ENGRAVE_DEFAULTS.width);
  out[15] = finite(params && params.strength, ENGRAVE_DEFAULTS.strength);
  return out;
}

/**
 * The JS mirror of the shader field: the multiply factor (1 = no line) at
 * asset-space point `au` for a joint list (asset space) and params. The
 * shader's fwidth band is replaced by a fixed band here (the mirror proves
 * the FIELD — where lines fall and that they follow the joints; the GL
 * selfcheck proves the rendered pixels). Same walk, same constants.
 */
export function engraveFactorAt(au, joints, params = ENGRAVE_DEFAULTS) {
  const spacing = finite(params && params.spacing, ENGRAVE_DEFAULTS.spacing);
  const width = finite(params && params.width, ENGRAVE_DEFAULTS.width);
  const strength = finite(params && params.strength, ENGRAVE_DEFAULTS.strength);
  if (!Array.isArray(joints) || joints.length < 2 || !(spacing > 0)) return 1;
  let bestD2 = Infinity;
  let bestS = 0;
  let bestLat = 0;
  let acc = 0;
  let a = joints[0];
  for (let k = 1; k < joints.length; k++) {
    const b = joints[k];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len = Math.hypot(abx, aby);
    let t = 0;
    if (len > 1e-6) {
      t = ((au.x - a.x) * abx + (au.y - a.y) * aby) / (len * len);
      t = Math.min(1, Math.max(0, t));
    }
    const qx = a.x + abx * t;
    const qy = a.y + aby * t;
    const d2 = (au.x - qx) * (au.x - qx) + (au.y - qy) * (au.y - qy);
    if (d2 < bestD2) {
      bestD2 = d2; bestS = acc + len * t;
      // the signed lateral distance from the spine: cross(segment dir, au - closest point)
      bestLat = len > 1e-6 ? (abx * (au.y - qy) - aby * (au.x - qx)) / len : 0;
    }
    acc += len;
    a = b;
  }
  const total = acc;
  const dl = Math.abs(((bestS / spacing) % 1 + 1.5) % 1 - 0.5) * spacing;
  const AA = 0.8; // asset units; the shader derives its band from fwidth instead
  const half = width * 0.5;
  const line = 1 - smooth(dl, half - AA, half + AA);
  // #1356 — the longitudinal seams: level sets of |lateral distance| at the seam offsets,
  // at ENGRAVE_SEAM_REL of the contour strength, sharing the contour line width.
  let dSeam = Infinity;
  for (const off of ENGRAVE_SEAM_OFFSETS) dSeam = Math.min(dSeam, Math.abs(Math.abs(bestLat) - off));
  const seam = 1 - smooth(dSeam, half - AA, half + AA);
  const lineAll = Math.max(line, seam * ENGRAVE_SEAM_REL);
  const endFade = smooth(bestS, -0.3 * spacing, 0.1 * spacing) * (1 - smooth(bestS, total - 0.1 * spacing, total + 0.3 * spacing));
  return 1 - strength * lineAll * endFade;
}

function smooth(x, lo, hi) {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}

/**
 * The GLSL expression of the same field (QUAD_FS): engraveShade(au, eA, eB,
 * eC, eP) -> the multiply factor for the fragment's ink. eA/eB/eC carry the
 * six joints (asset space), eP is [count, spacing, width, strength]. The
 * caller gates on eP.x > 1.5, so non-engraved instances never enter.
 */
export const ENGRAVE_GLSL = /* glsl */`
float engraveShade(vec2 au, vec4 eA, vec4 eB, vec4 eC, vec4 eP) {
  vec2 J[6];
  J[0] = eA.xy; J[1] = eA.zw; J[2] = eB.xy; J[3] = eB.zw; J[4] = eC.xy; J[5] = eC.zw;
  int n = int(eP.x + 0.5);
  float spacing = eP.y;
  float width = eP.z;
  float strength = eP.w;
  float bestD2 = 1e12;
  float bestS = 0.0;
  float bestLat = 0.0;
  float acc = 0.0;
  vec2 a = J[0];
  for (int k = 1; k < 6; k++) {
    if (k >= n) break;
    vec2 b = J[k];
    vec2 ab = b - a;
    float len = length(ab);
    float t = len > 1e-6 ? clamp(dot(au - a, ab) / (len * len), 0.0, 1.0) : 0.0;
    vec2 q = a + ab * t;
    vec2 dp = au - q;
    float d2 = dot(dp, dp);
    if (d2 < bestD2) {
      bestD2 = d2; bestS = acc + len * t;
      bestLat = len > 1e-6 ? (ab.x * dp.y - ab.y * dp.x) / len : 0.0;
    }
    acc += len;
    a = b;
  }
  float total = acc;
  float ph = bestS / spacing;
  float dl = abs(fract(ph + 0.5) - 0.5) * spacing;
  float aa = fwidth(dl) * 0.75 + 1e-4;
  float line = 1.0 - smoothstep(width * 0.5 - aa, width * 0.5 + aa, dl);
  float dSeam = min(abs(abs(bestLat) - 5.5), abs(abs(bestLat) - 11.0));
  float seam = 1.0 - smoothstep(width * 0.5 - aa, width * 0.5 + aa, dSeam);
  float lineAll = max(line, seam * 0.55);
  float endFade = smoothstep(-0.3 * spacing, 0.1 * spacing, bestS)
    * (1.0 - smoothstep(total - 0.1 * spacing, total + 0.3 * spacing, bestS));
  return 1.0 - strength * lineAll * endFade;
}
`;
