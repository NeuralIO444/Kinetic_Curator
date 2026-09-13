// Layout mode position generators — pure functions, no React
import { aliveCells } from '../ca-engine.js';

export function randomPos(w, h, rng) {
  return { x: rng() * w, y: rng() * h };
}

export function gridPos(i, count, w, h, rng, jitter) {
  const cols = Math.ceil(Math.sqrt(count * (w / h)));
  const rows = Math.ceil(count / cols);
  const cx = ((i % cols) + 0.5) / cols * w;
  const cy = (Math.floor(i / cols) + 0.5) / rows * h;
  return { x: cx + (rng() - 0.5) * jitter, y: cy + (rng() - 0.5) * jitter };
}

export function fibPos(i, count, w, h, rng, jitter) {
  const phi = (1 + Math.sqrt(5)) / 2;
  const angle = 2 * Math.PI * i / (phi * phi);
  const radius = Math.sqrt(i / count) * Math.min(w, h) * 0.48;
  const cx = w / 2 + Math.cos(angle) * radius;
  const cy = h / 2 + Math.sin(angle) * radius;
  return { x: cx + (rng() - 0.5) * jitter, y: cy + (rng() - 0.5) * jitter };
}

export function radialPos(i, count, w, h, rng, jitter) {
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

export function swarmPos(i, count, w, h, rng, jitter) {
  const cx = w * (0.3 + rng() * 0.4);
  const cy = h * (0.3 + rng() * 0.4);
  const spread = Math.min(w, h) * 0.35;
  return {
    x: cx + (rng() - 0.5) * spread + (rng() - 0.5) * jitter,
    y: cy + (rng() - 0.5) * spread + (rng() - 0.5) * jitter,
  };
}

export function flowPos(i, count, w, h, rng, jitter) {
  const t = count > 1 ? i / (count - 1) : 0.5;
  const x = t * w;
  const wave = Math.sin(t * Math.PI * 3 + rng() * 2) * h * 0.3;
  return { x: x + (rng() - 0.5) * jitter, y: h / 2 + wave + (rng() - 0.5) * jitter };
}

export function layerPos(i, count, w, h, rng, jitter) {
  const layers = 5;
  const layer = i % layers;
  const y = ((layer + 0.5) / layers) * h;
  return { x: rng() * w, y: y + (rng() - 0.5) * jitter };
}

export function railsPos(i, count, w, h, rng, jitter) {
  const rails = 6;
  const rail = i % rails;
  const x = ((rail + 0.5) / rails) * w;
  const t = count > 1 ? i / (count - 1) : 0.5;
  return { x: x + (rng() - 0.5) * jitter, y: t * h + (rng() - 0.5) * jitter };
}

export function caPos(i, count, w, h, rng, jitter, grid) {
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

export function orbitPos(i, count, w, h, rng, seed) {
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

export function abacusPos(i, count, w, h, rng, seed) {
  const rows = 8;
  const row = i % rows;
  const beadsPerRow = Math.ceil(count / rows);
  const beadIndex = Math.floor(i / rows);
  const y = ((row + 0.5) / rows) * h;
  const x = ((beadIndex + 0.5) / beadsPerRow) * w;
  const ghostOffset = ((seed >> (row * 2)) & 3) * 6 - 9;
  return { x: x + ghostOffset, y: y + (rng() - 0.5) * 4 };
}

/** Dispatch table for layout modes */
export const MODE_FNS = {
  grid: gridPos,
  fibonacci: fibPos,
  radial: radialPos,
  swarm: swarmPos,
  flow: flowPos,
  layers: layerPos,
  rails: railsPos,
  ca: caPos,
  orbit: orbitPos,
  abacus: abacusPos,
  noise: gridPos, // noise mode starts on grid then warps
  hype: swarmPos,
};
