/**
 * particles.js
 * Physics-based particle simulation system for Kinetic Curator.
 * Implements Perlin winds, Reynolds flocking (spatial-hash), and mouse attraction.
 *
 * Performance: neighbor queries use a uniform grid spatial hash (~O(N))
 * instead of a naïve O(N²) double loop.
 */

import { noise3D, seedNoise } from './noise.js';

class Particle {
  constructor(x, y, assetIndex, color, mass) {
    this.x = x;
    this.y = y;

    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 1.5 + 0.5;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    this.ax = 0;
    this.ay = 0;

    this.mass = mass || Math.random() * 0.8 + 0.4;
    this.scale = this.mass;
    this.rotation = angle;

    this.assetIndex = assetIndex;
    this.color = color;

    this.seedOffset = Math.random() * 10000;
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
  }

  init(count, canvasW, canvasH, activeAssets, palette, seed) {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = [];

    if (!activeAssets || activeAssets.length === 0) return;

    seedNoise(seed || 444);

    const swatches = palette?.swatches || ['#ffffff'];

    for (let i = 0; i < count; i++) {
      const x = Math.random() * canvasW;
      const y = Math.random() * canvasH;
      const assetIdx = i % activeAssets.length;
      const color = swatches[i % swatches.length];
      const mass = Math.random() * 0.8 + 0.4;

      this.particles.push(new Particle(x, y, assetIdx, color, mass));
    }
  }

  /**
   * Build a uniform-grid spatial hash for neighbor queries.
   * cellSize should be >= the largest interaction radius used.
   */
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

    const targetCount = layoutParams.particleCount || 100;
    if (this.particles.length !== targetCount) {
      this.init(targetCount, this.canvasW, this.canvasH, activeAssets, palette, seed);
    }

    const {
      noiseFreq = 0.005,
      noiseSpeed = 0.5,
      swarmCohesion = 1.5,
      gravityWells = 1.0,
      damping = 0.95,
      scale = [0.4, 1.6],
      alpha = [40, 100],
    } = layoutParams;

    const [minScale, maxScale] = scale;
    const [minAlpha, maxAlpha] = alpha;

    const nt = time * noiseSpeed * 0.001;

    const sepRadius = 35;
    const aliRadius = 60;
    const cohRadius = 70;
    const maxRadius = Math.max(sepRadius, aliRadius, cohRadius);

    const separationWeight = 1.8;
    const alignmentWeight = 1.0;
    const cohesionWeight = swarmCohesion;

    const numParticles = this.particles.length;

    // Spatial hash — cell size matches largest interaction radius
    const { grid, key, cellSize } = this._buildSpatialHash(maxRadius);

    for (let i = 0; i < numParticles; i++) {
      const p1 = this.particles[i];

      // Wind force (Simplex flow field)
      const n = noise3D(p1.x * noiseFreq, p1.y * noiseFreq, nt + p1.seedOffset * 0.0001);
      const windAngle = n * Math.PI * 2;
      const windMag = (noise3D(p1.x * noiseFreq + 200, p1.y * noiseFreq + 200, nt) + 1.0) * 0.4;
      p1.applyForce(Math.cos(windAngle) * windMag, Math.sin(windAngle) * windMag);

      // Mouse attractor
      if (attractor && gravityWells > 0) {
        const dx = attractor.x - p1.x;
        const dy = attractor.y - p1.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d > 5) {
          const forceMag = (gravityWells * 0.25) / Math.max(20, d * 0.05);
          p1.applyForce((dx / d) * forceMag, (dy / d) * forceMag);
        }
      }

      // Reynolds flocking via spatial hash (only neighboring cells)
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

            if (d > 0 && d < sepRadius) {
              sepX -= dx / d;
              sepY -= dy / d;
              sepCount++;
            }
            if (d > 0 && d < aliRadius) {
              aliX += p2.vx;
              aliY += p2.vy;
              aliCount++;
            }
            if (d > 0 && d < cohRadius) {
              cohX += p2.x;
              cohY += p2.y;
              cohCount++;
            }
          }
        }
      }

      if (sepCount > 0) {
        sepX /= sepCount;
        sepY /= sepCount;
        const mag = Math.sqrt(sepX * sepX + sepY * sepY);
        if (mag > 0) {
          p1.applyForce((sepX / mag) * separationWeight, (sepY / mag) * separationWeight);
        }
      }

      if (aliCount > 0) {
        aliX /= aliCount;
        aliY /= aliCount;
        const mag = Math.sqrt(aliX * aliX + aliY * aliY);
        if (mag > 0) {
          p1.applyForce((aliX / mag) * alignmentWeight, (aliY / mag) * alignmentWeight);
        }
      }

      if (cohCount > 0) {
        cohX /= cohCount;
        cohY /= cohCount;
        const steerX = cohX - p1.x;
        const steerY = cohY - p1.y;
        const mag = Math.sqrt(steerX * steerX + steerY * steerY);
        if (mag > 0) {
          p1.applyForce((steerX / mag) * cohesionWeight, (steerY / mag) * cohesionWeight);
        }
      }
    }

    // Integrate + bounds
    const pad = 120;
    const limitL = -pad;
    const limitR = this.canvasW + pad;
    const limitT = -pad;
    const limitB = this.canvasH + pad;

    for (let i = 0; i < numParticles; i++) {
      const p = this.particles[i];

      p.vx = (p.vx + p.ax) * damping;
      p.vy = (p.vy + p.ay) * damping;

      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const maxSpeed = 8.0;
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }

      p.x += p.vx;
      p.y += p.vy;

      p.ax = 0;
      p.ay = 0;

      if (speed > 0.1) {
        p.rotation = Math.atan2(p.vy, p.vx) * (180 / Math.PI);
      }

      p.scale = minScale + (p.mass * (maxScale - minScale));
      p.alpha = minAlpha + (p.mass * (maxAlpha - minAlpha));

      if (p.x < limitL) p.x = limitR;
      else if (p.x > limitR) p.x = limitL;

      if (p.y < limitT) p.y = limitB;
      else if (p.y > limitB) p.y = limitT;
    }
  }

  getItems(activeAssets) {
    if (!activeAssets || activeAssets.length === 0) return [];

    return this.particles.map(p => {
      const asset = activeAssets[p.assetIndex % activeAssets.length];
      return {
        x: p.x,
        y: p.y,
        scale: p.scale,
        rotation: p.rotation,
        alpha: p.alpha,
        asset,
        color: p.color,
      };
    });
  }
}
