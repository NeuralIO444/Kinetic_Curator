/**
 * particles.js
 * Physics-based particle simulation — Perlin winds, Reynolds flocking, mouse attract.
 * Kernel K1: wind field from createNoise(seed) instance (#59).
 *
 * #109 — when layout mode is `hype`, each physics particle is an organism
 * leader. Spine / wings are visual only. `swarm` stays a cloud.
 */

import { createNoise } from './noise.js';
import { CH, rngForIndex } from './kernel/rng.js';
import { isOrganismMode } from '../data/layout-modes.js';

export const ATTRACTOR_GAIN = 8;
const TAU = Math.PI * 2;
const MAX_TURN_DEG = 14;
const MAX_SPEED = 8.0;

class Particle {
  constructor(x, y, assetIndex, color, mass, angle, speed, seedOffset) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.ax = 0;
    this.ay = 0;
    this.mass = mass;
    this.scale = this.mass;
    this.rotation = angle * (180 / Math.PI);
    this.assetIndex = assetIndex;
    this.color = color;
    this.seedOffset = seedOffset;
    this.phase = 0;
    this.u = 0;
    this.spine = [{ x, y }];
  }

  applyForce(fx, fy) {
    this.ax += fx / this.mass;
    this.ay += fy / this.mass;
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.canvasW = 1000;
    this.canvasH = 700;
    this._noise = null;
    this._layout = null;
  }

  physicsCount() {
    return this.particles.length;
  }

  resetPhase() {
    for (const p of this.particles) p.phase = 0;
  }

  init(count, canvasW, canvasH, activeAssets, palette, seed) {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = [];
    this._noise = createNoise(seed || 444);

    if (!activeAssets || activeAssets.length === 0) return;

    const swatches = palette?.swatches || ['#ffffff'];

    for (let i = 0; i < count; i++) {
      const r = rngForIndex(seed >>> 0, CH.dyn, i);
      const x = r() * canvasW;
      const y = r() * canvasH;
      const assetIdx = i % activeAssets.length;
      const color = swatches[i % swatches.length];
      const mass = r() * 0.8 + 0.4;
      const angle = r() * TAU;
      const speed = r() * 1.5 + 0.5;
      const seedOffset = r() * 10000;
      this.particles.push(new Particle(x, y, assetIdx, color, mass, angle, speed, seedOffset));
    }
  }

  _buildSpatialHash(cellSize) {
    const grid = new Map();
    const key = (cx, cy) => `${cx},${cy}`;
    for (const p of this.particles) {
      const cx = Math.floor(p.x / cellSize);
      const cy = Math.floor(p.y / cellSize);
      const k = key(cx, cy);
      let bucket = grid.get(k);
      if (!bucket) {
        bucket = [];
        grid.set(k, bucket);
      }
      bucket.push(p);
    }
    return { grid, key, cellSize };
  }

  update(layoutParams, activeAssets, palette, seed, time, attractor) {
    if (this.particles.length === 0) return;
    this._layout = layoutParams;

    const targetCount = layoutParams.particleCount || 100;
    if (this.particles.length !== targetCount) {
      this.init(targetCount, this.canvasW, this.canvasH, activeAssets, palette, seed);
    }

    if (!this._noise) this._noise = createNoise(seed || 444);
    const noise = this._noise;

    const {
      noiseFreq = 0.005,
      noiseSpeed = 0.5,
      swarmCohesion = 1.5,
      gravityWells = 1.0,
      damping = 0.95,
      scale = [0.4, 1.6],
      alpha = [40, 100],
      wind = 1,
      body = 3,
      tight = 0.55,
    } = layoutParams;

    const organism = isOrganismMode(layoutParams.mode);
    const [minScale, maxScale] = scale;
    const [minAlpha, maxAlpha] = alpha;
    const nt = time * noiseSpeed * 0.001;
    const windMul = organism ? wind : 1;

    const sepRadius = 35;
    const aliRadius = 60;
    const cohRadius = 70;
    const maxRadius = Math.max(sepRadius, aliRadius, cohRadius);
    const separationWeight = 1.8;
    const alignmentWeight = 1.0;
    const cohesionWeight = swarmCohesion;
    const numParticles = this.particles.length;
    const { grid, key, cellSize } = this._buildSpatialHash(maxRadius);

    for (let i = 0; i < numParticles; i++) {
      const p1 = this.particles[i];
      const n = noise.noise3D(p1.x * noiseFreq, p1.y * noiseFreq, nt + p1.seedOffset * 0.0001);
      const windAngle = n * TAU;
      const windMag = (noise.noise3D(p1.x * noiseFreq + 200, p1.y * noiseFreq + 200, nt) + 1.0) * 0.4 * windMul;
      p1.applyForce(Math.cos(windAngle) * windMag, Math.sin(windAngle) * windMag);

      if (attractor && gravityWells > 0) {
        const dx = attractor.x - p1.x;
        const dy = attractor.y - p1.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 5) {
          const forceMag = (gravityWells * ATTRACTOR_GAIN) / Math.max(20, d * 0.05);
          p1.applyForce((dx / d) * forceMag, (dy / d) * forceMag);
        }
      }

      let sepX = 0, sepY = 0, sepCount = 0;
      let aliX = 0, aliY = 0, aliCount = 0;
      let cohX = 0, cohY = 0, cohCount = 0;
      const cx = Math.floor(p1.x / cellSize);
      const cy = Math.floor(p1.y / cellSize);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get(key(cx + ox, cy + oy));
          if (!bucket) continue;
          for (let j = 0; j < bucket.length; j++) {
            const p2 = bucket[j];
            if (p2 === p1) continue;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > 0 && d < sepRadius) { sepX -= dx / d; sepY -= dy / d; sepCount++; }
            if (d > 0 && d < aliRadius) { aliX += p2.vx; aliY += p2.vy; aliCount++; }
            if (d > 0 && d < cohRadius) { cohX += p2.x; cohY += p2.y; cohCount++; }
          }
        }
      }
      if (sepCount > 0) {
        sepX /= sepCount; sepY /= sepCount;
        const mag = Math.sqrt(sepX * sepX + sepY * sepY);
        if (mag > 0) p1.applyForce((sepX / mag) * separationWeight, (sepY / mag) * separationWeight);
      }
      if (aliCount > 0) {
        aliX /= aliCount; aliY /= aliCount;
        const mag = Math.sqrt(aliX * aliX + aliY * aliY);
        if (mag > 0) p1.applyForce((aliX / mag) * alignmentWeight, (aliY / mag) * alignmentWeight);
      }
      if (cohCount > 0) {
        cohX /= cohCount; cohY /= cohCount;
        const steerX = cohX - p1.x;
        const steerY = cohY - p1.y;
        const mag = Math.sqrt(steerX * steerX + steerY * steerY);
        if (mag > 0) p1.applyForce((steerX / mag) * cohesionWeight, (steerY / mag) * cohesionWeight);
      }
    }

    const pad = 120;
    const limitL = -pad, limitR = this.canvasW + pad, limitT = -pad, limitB = this.canvasH + pad;
    const bodyLen = Math.max(1, Math.min(7, Math.round(body || 1)));
    const follow = Math.max(0.05, Math.min(0.95, tight));

    for (let i = 0; i < numParticles; i++) {
      const p = this.particles[i];
      p.vx = (p.vx + p.ax) * damping;
      p.vy = (p.vy + p.ay) * damping;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > MAX_SPEED) {
        p.vx = (p.vx / speed) * MAX_SPEED;
        p.vy = (p.vy / speed) * MAX_SPEED;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.ax = 0;
      p.ay = 0;

      if (speed > 0.1) {
        const next = Math.atan2(p.vy, p.vx) * (180 / Math.PI);
        if (organism) {
          let d = next - p.rotation;
          while (d > 180) d -= 360;
          while (d < -180) d += 360;
          if (d > MAX_TURN_DEG) d = MAX_TURN_DEG;
          if (d < -MAX_TURN_DEG) d = -MAX_TURN_DEG;
          p.rotation += d;
        } else {
          p.rotation = next;
        }
      }

      p.scale = minScale + (p.mass * (maxScale - minScale));
      p.alpha = minAlpha + (p.mass * (maxAlpha - minAlpha));
      p.u = Math.max(0, Math.min(1, speed / MAX_SPEED));
      p.phase = (p.phase + 0.008 * noiseSpeed) % 1;

      if (organism) {
        if (!p.spine || p.spine.length === 0) p.spine = [{ x: p.x, y: p.y }];
        const head = { x: p.x, y: p.y };
        const nextSpine = [head];
        for (let s = 1; s < bodyLen; s++) {
          const prev = nextSpine[s - 1];
          const cur = p.spine[s] || p.spine[p.spine.length - 1] || head;
          nextSpine.push({
            x: cur.x + (prev.x - cur.x) * follow,
            y: cur.y + (prev.y - cur.y) * follow,
          });
        }
        p.spine = nextSpine;
      }

      if (p.x < limitL) p.x = limitR;
      else if (p.x > limitR) p.x = limitL;
      if (p.y < limitT) p.y = limitB;
      else if (p.y > limitB) p.y = limitT;
    }
  }

  getItems(activeAssets) {
    if (!activeAssets || activeAssets.length === 0) return [];
    const lp = this._layout || {};
    if (!isOrganismMode(lp.mode)) {
      return this.particles.map((p) => ({
        x: p.x,
        y: p.y,
        scale: p.scale,
        rotation: p.rotation,
        alpha: p.alpha,
        asset: activeAssets[p.assetIndex % activeAssets.length],
        color: p.color,
        u: p.u,
      }));
    }
    return this._organismItems(activeAssets, lp);
  }

  _organismItems(activeAssets, lp) {
    const bodyLen = Math.max(1, Math.min(7, Math.round(lp.body || 1)));
    const flap = Number.isFinite(lp.flap) ? lp.flap : 0.35;
    const symmetry = lp.symmetry || 'none';
    const items = [];
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const asset = activeAssets[p.assetIndex % activeAssets.length];
      const spine = p.spine && p.spine.length ? p.spine : [{ x: p.x, y: p.y }];
      for (let s = 0; s < bodyLen; s++) {
        const pt = spine[Math.min(s, spine.length - 1)];
        items.push({
          x: pt.x,
          y: pt.y,
          scale: p.scale * (1 - s * 0.1),
          rotation: p.rotation,
          alpha: p.alpha * (1 - s * 0.08),
          asset,
          color: p.color,
          u: p.u,
          key: `o${i}-s${s}`,
          role: s === 0 ? 'body' : 'segment',
        });
      }
      if (symmetry === 'bilateral') {
        const heading = p.rotation * (Math.PI / 180);
        const px = Math.cos(heading);
        const py = Math.sin(heading);
        const amp = flap * Math.sin(p.phase * TAU + p.seedOffset);
        const reach = 16 + Math.abs(amp) * 20;
        const ox = -py * reach;
        const oy = px * reach;
        items.push({
          x: p.x + ox, y: p.y + oy,
          scale: p.scale * 0.7, rotation: p.rotation + amp * 18,
          alpha: p.alpha, asset, color: p.color, u: p.u,
          key: `o${i}-wl`, role: 'wing',
        });
        items.push({
          x: p.x - ox, y: p.y - oy,
          scale: p.scale * 0.7, rotation: p.rotation - amp * 18,
          alpha: p.alpha, asset, color: p.color, u: p.u,
          key: `o${i}-wr`, role: 'wing', _mirrored: true,
        });
      }
    }
    return items;
  }
}
