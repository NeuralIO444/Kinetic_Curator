// Wear stamp pack generator — RAY GUN P1 · TORN & XEROXED (#2010).
//
// Bakes two worn variants of every Latin LETTER the poem system stamps in a treatable face — Anton caps (typ_A–Z),
// Anton lowercase (typ_l_a–z), PT Serif (typ_s_A–z) — from the path data those packs already carry. No font is read:
// every variant is a path operation on the baked outline, done here, at bake, so it costs nothing at runtime (the
// FONT RULING: glyph SHAPE changes are baked variants; runtime only moves stamps). The plate face is never treated
// (#2005), so it gets no wear; digits, punctuation, ornaments and the native packs are out of P1's scope.
//
//   TORN   — the glyph is cut along a seeded, ragged tear line through its middle and the two halves are pulled
//            apart (a small translate + twist on the far half). Two clipPaths over the same outline: the ink is the
//            letter's own, only cut.
//   XEROX  — photocopy generation loss as geometry: the outline's points shake (straight edges are subdivided first,
//            so a long stem goes ragged rather than bent), toner drop-outs are bitten out of the ink by a mask of
//            seeded blots, and a scatter of toner specks lands around the letter.
//
// Deterministic: every random draw is keyed by the variant's id (FNV-1a → the engine's mkRng), so a regen is
// byte-identical (the wear selfcheck re-runs this bake in memory and compares). Every <defs> id is the variant's own
// id (unique across the catalogue — the experimental pack's convention), so two stamps in one SVG never collide.
//
// POEM-ONLY, like every face pack: catalogue members after the authored bake, excluded by id on every dealing
// surface (poets/placement.js WEAR_STAMP_IDS joins POEM_ONLY_STAMP_IDS). Only the ray gun's draw ever names one —
// rayGunForm moves a treated stamp to ITS OWN LETTER's worn variant, at draw time (ruling D1: a treated stamp keeps
// its `ch`; its face may move). Run from the repo root:
//   node scripts/gen-wear.mjs
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ASSETS_LETTERS } from "../app/src/data/assets/assets-letterforms.js";
import { ASSETS_LATIN } from "../app/src/data/assets/assets-latin.js";
import { ASSETS_SERIF } from "../app/src/data/assets/assets-serif.js";
import { mkRng } from "../app/src/engine/prng.js";

const r2 = (n) => Math.round(n * 100) / 100;
const fnv = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};
const rngFor = (id) => mkRng(fnv(id));

/** The source letters, in pack order: [sourceId, ch, face, svg]. */
export function wearSources() {
  const out = [];
  for (const a of ASSETS_LETTERS) {
    const m = /^typ_([A-Z])$/.exec(a.id);
    if (m) out.push({ id: a.id, ch: m[1], face: "anton", svg: a.svg });
  }
  for (const a of ASSETS_LATIN)
    if (a.tags.includes("lowercase"))
      out.push({ id: a.id, ch: a.glyph, face: "anton", svg: a.svg });
  for (const a of ASSETS_SERIF)
    out.push({ id: a.id, ch: a.glyph, face: "serif", svg: a.svg });
  return out;
}

/** 'typ_A' -> 'typ_tn_A', 'typ_l_a' -> 'typ_tn_l_a', 'typ_s_A' -> 'typ_tn_s_A' (xerox: typ_xr_…). */
export const wearId = (sourceId, kind) =>
  `typ_${kind === "torn" ? "tn" : "xr"}_${sourceId.slice(4)}`;

const pathD = (svg) => {
  const m = /<path d="([^"]+)"/.exec(svg);
  if (!m) throw new Error("source stamp has no path");
  return m[1];
};

/** Parse baked path data (M/L/C/Q/Z, absolute, as the face generators write it) into commands. */
function parseD(d) {
  const toks = d.match(/[MLCQZ]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const cmds = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i++];
    const n = { M: 2, L: 2, C: 6, Q: 4, Z: 0 }[t];
    if (n === undefined) throw new Error(`unexpected token ${t}`);
    const nums = toks.slice(i, i + n).map(Number);
    i += n;
    cmds.push({ t, p: nums });
  }
  return cmds;
}

const fmt = (cmds) =>
  cmds
    .map(
      (c) =>
        c.t + (c.p.length ? c.p.map(r2).join(" ").replace(/ -/g, " -") : ""),
    )
    .join("");

function bbox(cmds) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cmds)
    for (let k = 0; k < c.p.length; k += 2) {
      x0 = Math.min(x0, c.p[k]);
      x1 = Math.max(x1, c.p[k]);
      y0 = Math.min(y0, c.p[k + 1]);
      y1 = Math.max(y1, c.p[k + 1]);
    }
  return { x0, y0, x1, y1 };
}

// ── TORN ────────────────────────────────────────────────────────────────
const TEAR_TEETH = 9; // vertices along the tear line (ragged, not straight)
const TEAR_TOOTH = 2.6; // ± perpendicular jag, viewBox units
const TEAR_MAX_ANGLE = 38; // the tear crosses the letter within ± this of horizontal (degrees)
const TEAR_OFFSET = 9; // the cut passes within ± this of the glyph's centre
const TEAR_PULL = [4, 7.5]; // how far the far half is pulled away, along the tear's normal
const TEAR_SLIDE = 2.0; // ± slide along the tear
const TEAR_TWIST = 6; // ± degrees the far half turns, about the tear's centre
const FAR = 400; // half-plane polygons reach this far (beyond any atlas cell)

function torn(src) {
  const id = wearId(src.id, "torn");
  const rng = rngFor(id);
  const d = pathD(src.svg);
  const b = bbox(parseD(d));
  const cx = (b.x0 + b.x1) / 2 + (rng() * 2 - 1) * TEAR_OFFSET * 0.4;
  const cy = (b.y0 + b.y1) / 2 + (rng() * 2 - 1) * TEAR_OFFSET;
  const ang = ((rng() * 2 - 1) * TEAR_MAX_ANGLE * Math.PI) / 180;
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const nx = -uy;
  const ny = ux;
  // the ragged line, end to end across the cell
  const line = [];
  for (let k = 0; k <= TEAR_TEETH; k++) {
    const t = -FAR + (2 * FAR * k) / TEAR_TEETH;
    // the jag only matters where the ink is; teeth near the middle are where the letter is
    const near = Math.abs(t) < 60 ? 1 : 0;
    const j = near * (rng() * 2 - 1) * TEAR_TOOTH;
    line.push([cx + ux * t + nx * j, cy + uy * t + ny * j]);
  }
  // denser teeth through the letter itself: re-sample the middle stretch
  const mid = [];
  const SPAN = 70;
  const STEPS = 14;
  for (let k = 0; k <= STEPS; k++) {
    const t = -SPAN + (2 * SPAN * k) / STEPS;
    const j = (rng() * 2 - 1) * TEAR_TOOTH;
    mid.push([cx + ux * t + nx * j, cy + uy * t + ny * j]);
  }
  const pts = [line[0], ...mid, line[line.length - 1]];
  const poly = (sign) => {
    const far = pts
      .slice()
      .reverse()
      .map(([x, y]) => [x + nx * FAR * sign, y + ny * FAR * sign]);
    return (
      "M" +
      [...pts, ...far].map(([x, y]) => `${r2(x)} ${r2(y)}`).join("L") +
      "Z"
    );
  };
  const pull = TEAR_PULL[0] + rng() * (TEAR_PULL[1] - TEAR_PULL[0]);
  const slide = (rng() * 2 - 1) * TEAR_SLIDE;
  const twist = (rng() * 2 - 1) * TEAR_TWIST;
  const tx = nx * pull + ux * slide;
  const ty = ny * pull + uy * slide;
  // Pull the WHOLE glyph back by half the pull, so the torn letter stays centred on its cell.
  const bx = -tx / 2;
  const by = -ty / 2;
  const svg =
    `<defs><clipPath id="${id}_a"><path d="${poly(-1)}"/></clipPath>` +
    `<clipPath id="${id}_b"><path d="${poly(1)}"/></clipPath></defs>` +
    `<g transform="translate(${r2(bx)} ${r2(by)})">` +
    `<g clip-path="url(#${id}_a)"><path d="${d}" fill="var(--ink)"/></g>` +
    `<g transform="translate(${r2(tx)} ${r2(ty)}) rotate(${r2(twist)} ${r2(cx)} ${r2(cy)})">` +
    `<g clip-path="url(#${id}_b)"><path d="${d}" fill="var(--ink)"/></g></g></g>`;
  return { id, src, svg, kind: "torn" };
}

// ── XEROX ───────────────────────────────────────────────────────────────
const XR_SUBDIV = 5; // straight edges longer than this (units) are split, so they go ragged
const XR_SHAKE = 0.75; // ± point shake, units
const XR_BLOTS = [5, 9]; // toner drop-outs bitten from the glyph's box (those landing on paper bite nothing)
const XR_BLOT_R = [1.0, 2.6];
const XR_SPECKS = [7, 14]; // toner specks scattered around the letter
const XR_SPECK_R = [0.35, 0.95];
const XR_SPECK_REACH = 9; // specks land within this margin of the glyph's box

function blob(rng, x, y, r, sides) {
  const pts = [];
  const a0 = rng() * Math.PI * 2;
  for (let k = 0; k < sides; k++) {
    const a = a0 + (k / sides) * Math.PI * 2;
    const rr = r * (0.6 + rng() * 0.6);
    pts.push(`${r2(x + Math.cos(a) * rr)} ${r2(y + Math.sin(a) * rr)}`);
  }
  return "M" + pts.join("L") + "Z";
}

function xerox(src) {
  const id = wearId(src.id, "xerox");
  const rng = rngFor(id);
  const cmds = parseD(pathD(src.svg));
  const shook = [];
  let cur = [0, 0];
  let start = [0, 0];
  const shake = () => (rng() * 2 - 1) * XR_SHAKE;
  for (const c of cmds) {
    if (c.t === "M") {
      cur = [c.p[0], c.p[1]];
      start = cur;
      shook.push({ t: "M", p: [c.p[0] + shake(), c.p[1] + shake()] });
    } else if (c.t === "L" || c.t === "Z") {
      const [x, y] = c.t === "L" ? c.p : start;
      const len = Math.hypot(x - cur[0], y - cur[1]);
      const n = Math.max(1, Math.ceil(len / XR_SUBDIV));
      for (let k = 1; k < n; k++) {
        const t = k / n;
        shook.push({
          t: "L",
          p: [
            cur[0] + (x - cur[0]) * t + shake(),
            cur[1] + (y - cur[1]) * t + shake(),
          ],
        });
      }
      if (c.t === "L") shook.push({ t: "L", p: [x + shake(), y + shake()] });
      else shook.push({ t: "Z", p: [] });
      cur = c.t === "L" ? [x, y] : start;
    } else {
      shook.push({ t: c.t, p: c.p.map((v) => v + shake()) });
      cur = [c.p[c.p.length - 2], c.p[c.p.length - 1]];
    }
  }
  const b = bbox(cmds);
  const between = (lo, hi) => lo + rng() * (hi - lo);
  const blots = [];
  const nb = Math.round(between(XR_BLOTS[0], XR_BLOTS[1]));
  for (let k = 0; k < nb; k++)
    blots.push(
      blob(
        rng,
        between(b.x0, b.x1),
        between(b.y0, b.y1),
        between(XR_BLOT_R[0], XR_BLOT_R[1]),
        7,
      ),
    );
  const specks = [];
  const ns = Math.round(between(XR_SPECKS[0], XR_SPECKS[1]));
  for (let k = 0; k < ns; k++)
    specks.push(
      blob(
        rng,
        between(b.x0 - XR_SPECK_REACH, b.x1 + XR_SPECK_REACH),
        between(b.y0 - XR_SPECK_REACH, b.y1 + XR_SPECK_REACH),
        between(XR_SPECK_R[0], XR_SPECK_R[1]),
        5,
      ),
    );
  const svg =
    `<defs><mask id="${id}_m" maskUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200">` +
    `<rect x="-50" y="-50" width="200" height="200" fill="#ffffff"/><path d="${blots.join("")}" fill="#000000"/></mask></defs>` +
    `<g mask="url(#${id}_m)"><path d="${fmt(shook)}" fill="var(--ink)"/></g>` +
    `<path d="${specks.join("")}" fill="var(--ink)"/>`;
  return { id, src, svg, kind: "xerox" };
}

/** The whole pack's source text — the generator's one output (the selfcheck compares a regen against the file). */
export function wearPackSource() {
  const variants = [];
  for (const src of wearSources()) variants.push(torn(src));
  for (const src of wearSources()) variants.push(xerox(src));
  const entries = variants.map(
    (v) =>
      `  {\n` +
      `    id: '${v.id}',\n` +
      `    category: 'geometric',\n` +
      `    tags: ['type', 'letter', 'wear', '${v.kind}'${v.src.face === "serif" ? ", 'serif'" : ""}],\n` +
      `    weight: 'medium',\n` +
      `    density: 'solid',\n` +
      `    scale: [0.3, 1.2],\n` +
      `    rotate: 'free',\n` +
      `    glyph: '${v.src.ch}',\n` +
      `    wearOf: '${v.src.id}',\n` +
      `    svg: \`${v.svg}\`,\n` +
      `  },`,
  );
  return `// Wear stamp pack — RAY GUN P1 · TORN & XEROXED (#2010): two worn variants of every treatable Latin letter, POEM-ONLY.
// Generated by scripts/gen-wear.mjs — edit the generator, not this file.
// Derived from the baked path data of the Anton caps (assets-letterforms), the Anton lowercase (assets-latin) and the
// PT Serif letters (assets-serif) — no font is read; see those packs for their faces' licences (SIL OFL 1.1). TORN cuts
// the outline along a seeded ragged line and pulls the halves apart (two clipPaths over the letter's own ink); XEROX
// shakes the outline, bites toner drop-outs from it (a mask) and scatters toner specks. Every <defs> id is the
// stamp's own id. Only the ray gun's draw names these (poets/rayGunForm.js), as a treated stamp's own letter.
// Colors: var(--ink) primary.
export const ASSETS_WEAR = [\n${entries.join("\n")}\n];\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync("app/src/data/assets/assets-wear.js", wearPackSource());
  console.log("wrote", wearSources().length * 2, "wear assets");
}
