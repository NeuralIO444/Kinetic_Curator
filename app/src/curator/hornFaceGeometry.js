// hornFaceGeometry.js — the three horn faces as pure geometry (#2388, Persona Kernel P8).
//
// Each face is drawn from its persona's own design language, never a portrait (R6, R10):
//   BLAST       one letter, B, built from a coarse bitmap; it tears (rows slip sideways) and scatters (cells fly)
//               with its measured degree, and is whole when laid out.
//   HYBRID      a bitmap square of coarse cells cycling the spectrum; it stacks into translucent layers when she
//               builds on someone.
//   SWISS GRIT  a perfect grid cell; its fill misregisters off the grid and grits when it is destroying, and it is
//               clean and square at rest.
//
// Pure functions of a resolved horn state (curator/hornFaces.js): no clock, no timer, no Math.random. The same
// state always yields the same picture; a picture changes only when the state does. The "randomness" of a tear or
// a speckle is an integer hash of (cell, state.variant) — the variant is a measured number, so the picture is
// replay-exact. All coordinates live in a 48 x 48 viewBox.

export const FACE_BOX = 48;

/** Integer hash -> [0, 1). Deterministic; no state. */
export function hash01(a, b = 0, c = 0) {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const signed = (u) => u * 2 - 1;

// ── BLAST: the letter ──────────────────────────────────────────────────────────────────────────────────────
const B_ROWS = ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'];
const B_CELL = 5; // 5 cols x 5 = 25 wide, 7 rows x 5 = 35 tall
const B_X0 = (FACE_BOX - 5 * B_CELL) / 2;
const B_Y0 = (FACE_BOX - 7 * B_CELL) / 2;

/**
 * @param {{degree:number, armed?:boolean, variant?:number}} s
 * @returns {{ cells: {x:number,y:number,w:number,h:number,rot:number,o:number}[] }}  every cell is one square of the letter
 */
export function blastGeometry(s) {
  const degree = Math.max(0, Math.min(3, s.degree | 0));
  const v = s.variant | 0;
  const cells = [];
  for (let r = 0; r < B_ROWS.length; r++) {
    // tearing: the whole row slips sideways together, by an amount that grows with the degree
    const slip = degree > 0 ? signed(hash01(r, v, 1)) * degree * 3.2 : 0;
    for (let c = 0; c < 5; c++) {
      if (B_ROWS[r][c] !== '#') continue;
      let x = B_X0 + c * B_CELL + slip;
      let y = B_Y0 + r * B_CELL;
      let rot = 0;
      let o = 1;
      if (degree >= 2) {
        // scattering: individual cells fly off the row
        const k = degree - 1;
        x += signed(hash01(r, c, v + 2)) * k * 4.5;
        y += signed(hash01(r, c, v + 3)) * k * 4.5;
        rot = signed(hash01(r, c, v + 4)) * k * 28;
        if (degree === 3 && hash01(r, c, v + 5) < 0.3) o = 0.45;
      }
      if (s.armed && r === 0 && c === 3) x += 1.6; // armed: one cell already loose
      cells.push({ x, y, w: B_CELL - 0.8, h: B_CELL - 0.8, rot, o });
    }
  }
  return { cells };
}

// ── HYBRID: the bitmap square ──────────────────────────────────────────────────────────────────────────────
const H_N = 6;
const H_CELL = 5.5;
const H_SIDE = H_N * H_CELL;
const H_X0 = (FACE_BOX - H_SIDE) / 2;

/**
 * @param {{layers:number, variant?:number}} s
 * @returns {{ layers: { dx:number, dy:number, o:number, cells: {x:number,y:number,s:number,hue:number}[] }[] }}
 *   back layer first. The hue of a cell is its place on the spectrum; the variant moves the whole square along it.
 */
export function hybridGeometry(s) {
  const n = s.layers >= 3 ? 3 : 1;
  const v = s.variant | 0;
  const layers = [];
  for (let l = 0; l < n; l++) {
    const front = l === n - 1;
    const cells = [];
    for (let r = 0; r < H_N; r++) {
      for (let c = 0; c < H_N; c++) {
        // a layer behind keeps a sparser, offset bitmap; the front layer is the whole square
        if (!front && hash01(r, c, l + 11) < 0.35) continue;
        cells.push({
          x: H_X0 + c * H_CELL,
          y: H_X0 + r * H_CELL,
          s: H_CELL - 0.6,
          hue: (v * 40 + (c + r) * 22 + l * 50) % 360,
        });
      }
    }
    const back = n - 1 - l;
    layers.push({ dx: -back * 3.2, dy: back * 3.2, o: front ? 1 : 0.4, cells });
  }
  return { layers };
}

// ── SWISS GRIT: the grid cell ──────────────────────────────────────────────────────────────────────────────
const G_SIDE = 32;
const G_X0 = (FACE_BOX - G_SIDE) / 2;

/**
 * @param {{degree:number, armed?:boolean, variant?:number}} s
 * @returns {{ frame:{x:number,y:number,s:number}, lines:number[], fill:{x:number,y:number,s:number}, speckles:{x:number,y:number,r:number}[], marks:boolean }}
 *   `frame` and `lines` are the perfect grid and never move; `fill` is the printed layer and slips off it by degree.
 */
export function gritGeometry(s) {
  const degree = Math.max(0, Math.min(3, s.degree | 0));
  const v = s.variant | 0;
  const off = degree * 1.7;
  const fill = {
    x: G_X0 + 4 + (degree ? signed(hash01(1, v, 21)) * off : 0),
    y: G_X0 + 4 + (degree ? signed(hash01(2, v, 21)) * off : 0),
    s: G_SIDE - 8,
  };
  const speckles = [];
  const count = degree * 9;
  for (let i = 0; i < count; i++) {
    speckles.push({
      x: G_X0 + hash01(i, v, 31) * G_SIDE,
      y: G_X0 + hash01(i, v, 32) * G_SIDE,
      r: 0.5 + hash01(i, v, 33) * (0.4 + degree * 0.3),
    });
  }
  return {
    frame: { x: G_X0, y: G_X0, s: G_SIDE },
    lines: [G_X0 + G_SIDE / 4, G_X0 + G_SIDE / 2, G_X0 + (3 * G_SIDE) / 4],
    fill,
    speckles,
    marks: !!s.armed,
  };
}
