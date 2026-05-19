// Placement engine — computes asset positions for all layout modes
// Extracted from ui-canvas.jsx (~200 lines of pure math, no React)

import { mkRng } from './prng.js';
import { aliveCells, stepGrid, createGrid } from './ca-engine.js';
import { fBm3D } from './noise.js';

/**
 * Compute placement positions for a given layout mode.
 * Returns: [{ x, y, scale, rotation, alpha, colorIndex, zTier }]
 */
export function computePlacements({
  mode, count, seed, scale, rotate, alpha, jitter, density, zTiers, bleed, canvasW, canvasH, caGrid,
  displacement = 0, noiseFreq = 0.005, noiseSpeed = 0.5
}) {
  const rng = mkRng(seed);
  const placements = [];

  // Bleed extends bounds by 20% on each side
  const bx = bleed ? canvasW * 0.2 : 0;
  const by = bleed ? canvasH * 0.2 : 0;
  const effectiveW = canvasW + bx * 2;
  const effectiveH = canvasH + by * 2;

  const tiers = Math.max(1, zTiers || 1);

  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;

    // FG-03: density acts as a probability gate — skip placements to thin out
    if (density < 100 && rng() * 100 > density) continue;

    let pos;

    switch (mode) {
      case 'grid':      pos = gridPos(i, count, effectiveW, effectiveH, rng, jitter); break;
      case 'fibonacci':  pos = fibPos(i, count, effectiveW, effectiveH, rng, jitter); break;
      case 'radial':     pos = radialPos(i, count, effectiveW, effectiveH, rng, jitter); break;
      case 'swarm':      pos = swarmPos(i, count, effectiveW, effectiveH, rng, jitter); break;
      case 'flow':       pos = flowPos(i, count, effectiveW, effectiveH, rng, jitter); break;
      case 'layers':     pos = layerPos(i, count, effectiveW, effectiveH, rng, jitter); break;
      case 'rails':      pos = railsPos(i, count, effectiveW, effectiveH, rng, jitter); break;
      case 'ca':         pos = caPos(i, count, effectiveW, effectiveH, rng, jitter, caGrid); break;
      case 'orbit':      pos = orbitPos(i, count, effectiveW, effectiveH, rng, seed); break;
      case 'abacus':     pos = abacusPos(i, count, effectiveW, effectiveH, rng, seed); break;
      case 'noise':      pos = gridPos(i, count, effectiveW, effectiveH, rng, jitter); break; // start with grid, then warp!
      default:           pos = randomPos(effectiveW, effectiveH, rng); break;
    }

    // TSK-14: Fractal Noise Displacement warping
    if (displacement > 0) {
      const nt = (seed & 0xffff) * 0.02; // seed acts as stable phase offset
      const dx = fBm3D(pos.x * noiseFreq, pos.y * noiseFreq, nt, 3) * displacement;
      const dy = fBm3D(pos.x * noiseFreq + 200, pos.y * noiseFreq + 200, nt + 100, 3) * displacement;
      pos.x += dx;
      pos.y += dy;
    }

    // Offset back from bleed origin
    if (bleed) {
      pos.x -= bx;
      pos.y -= by;
    }

    // FG-03: zTier assignment — distributes placements across depth tiers
    const zTier = i % tiers;
    // Rear tiers (0) scale down, front tiers (N-1) scale up
    const depthFactor = tiers > 1 ? 0.6 + (zTier / (tiers - 1)) * 0.8 : 1.0;

    const s = lerp(scale[0], scale[1], rng()) * depthFactor;
    const r = lerp(rotate[0], rotate[1], rng());
    const a = lerp(alpha[0], alpha[1], rng());

    placements.push({ ...pos, scale: s, rotation: r, alpha: a, index: i, t, zTier });
  }

  return placements;
}

// ── Helpers ──────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t; }

function randomPos(w, h, rng) {
  return { x: rng() * w, y: rng() * h };
}

function gridPos(i, count, w, h, rng, jitter) {
  const cols = Math.ceil(Math.sqrt(count * (w / h)));
  const rows = Math.ceil(count / cols);
  const cx = ((i % cols) + 0.5) / cols * w;
  const cy = (Math.floor(i / cols) + 0.5) / rows * h;
  return { x: cx + (rng() - 0.5) * jitter, y: cy + (rng() - 0.5) * jitter };
}

function fibPos(i, count, w, h, rng, jitter) {
  const phi = (1 + Math.sqrt(5)) / 2;
  const angle = 2 * Math.PI * i / (phi * phi);
  const radius = Math.sqrt(i / count) * Math.min(w, h) * 0.48;
  const cx = w / 2 + Math.cos(angle) * radius;
  const cy = h / 2 + Math.sin(angle) * radius;
  return { x: cx + (rng() - 0.5) * jitter, y: cy + (rng() - 0.5) * jitter };
}

function radialPos(i, count, w, h, rng, jitter) {
  const rings = Math.ceil(Math.sqrt(count));
  const ring = Math.floor(i / rings);
  const seg = i % rings;
  const angle = (seg / rings) * Math.PI * 2 + ring * 0.3;
  const radius = ((ring + 1) / rings) * Math.min(w, h) * 0.44;
  return {
    x: w / 2 + Math.cos(angle) * radius + (rng() - 0.5) * jitter,
    y: h / 2 + Math.sin(angle) * radius + (rng() - 0.5) * jitter,
  };
}

function swarmPos(i, count, w, h, rng, jitter) {
  const cx = w * (0.3 + rng() * 0.4);
  const cy = h * (0.3 + rng() * 0.4);
  const spread = Math.min(w, h) * 0.35;
  return {
    x: cx + (rng() - 0.5) * spread + (rng() - 0.5) * jitter,
    y: cy + (rng() - 0.5) * spread + (rng() - 0.5) * jitter,
  };
}

function flowPos(i, count, w, h, rng, jitter) {
  const t = count > 1 ? i / (count - 1) : 0.5;
  const x = t * w;
  const wave = Math.sin(t * Math.PI * 3 + rng() * 2) * h * 0.3;
  return { x: x + (rng() - 0.5) * jitter, y: h / 2 + wave + (rng() - 0.5) * jitter };
}

function layerPos(i, count, w, h, rng, jitter) {
  const layers = 5;
  const layer = i % layers;
  const y = ((layer + 0.5) / layers) * h;
  return { x: rng() * w, y: y + (rng() - 0.5) * jitter };
}

function railsPos(i, count, w, h, rng, jitter) {
  const rails = 6;
  const rail = i % rails;
  const x = ((rail + 0.5) / rails) * w;
  const t = count > 1 ? i / (count - 1) : 0.5;
  return { x: x + (rng() - 0.5) * jitter, y: t * h + (rng() - 0.5) * jitter };
}

function caPos(i, count, w, h, rng, jitter, grid) {
  if (!grid) return randomPos(w, h, rng);
  const cells = aliveCells(grid);
  if (cells.length === 0) return randomPos(w, h, rng);
  const cell = cells[i % cells.length];
  const cols = grid[0].length;
  const rows = grid.length;
  return {
    x: (cell.x / cols) * w + (rng() - 0.5) * jitter,
    y: (cell.y / rows) * h + (rng() - 0.5) * jitter,
  };
}

function orbitPos(i, count, w, h, rng, seed) {
  // 3 invisible planets — assets orbit around them
  const planets = [
    { cx: w * 0.28, cy: h * 0.35, r: Math.min(w, h) * 0.22, speed: 1.0 },
    { cx: w * 0.68, cy: h * 0.55, r: Math.min(w, h) * 0.28, speed: 0.7 },
    { cx: w * 0.48, cy: h * 0.75, r: Math.min(w, h) * 0.18, speed: 1.3 },
  ];
  const p = planets[i % 3];
  const angle = (i / count) * Math.PI * 2 * p.speed + (seed & 0xff) * 0.01;
  const radJitter = rng() * p.r * 0.3;
  return {
    x: p.cx + Math.cos(angle) * (p.r + radJitter),
    y: p.cy + Math.sin(angle) * (p.r + radJitter),
  };
}

function abacusPos(i, count, w, h, rng, seed) {
  const rows = 8;
  const row = i % rows;
  const beadsPerRow = Math.ceil(count / rows);
  const beadIndex = Math.floor(i / rows);
  const y = ((row + 0.5) / rows) * h;
  const x = ((beadIndex + 0.5) / beadsPerRow) * w;
  // Ghost recoil — subtle offset copies
  const ghostOffset = ((seed >> (row * 2)) & 3) * 6 - 9;
  return { x: x + ghostOffset, y: y + (rng() - 0.5) * 4 };
}
