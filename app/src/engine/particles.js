/**
 * particles.js
 * Physics-based particle simulation system for Kinetic Curator.
 * Implements Perlin winds, Reynolds flocking, and mouse attraction gravity wells.
 */

import { noise3D, seedNoise } from './noise.js';

class Particle {
  constructor(x, y, assetIndex, color, mass) {
    this.x = x;
    this.y = y;
    
    // Random initial velocity
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 1.5 + 0.5;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    
    // Accumulator forces
    this.ax = 0;
    this.ay = 0;
    
    this.mass = mass || Math.random() * 0.8 + 0.4;
    this.scale = this.mass; // Scale aligns with mass for depth perspective
    this.rotation = angle;
    
    this.assetIndex = assetIndex;
    this.color = color;
    
    this.seedOffset = Math.random() * 10000;
  }

  applyForce(fx, fy) {
    // F = ma -> a = F/m
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

  /**
   * Initializes the particle array based on count.
   * Maps assets and colors from active pools.
   */
  init(count, canvasW, canvasH, activeAssets, palette, seed) {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this.particles = [];
    
    if (!activeAssets || activeAssets.length === 0) return;
    
    // Seed noise with active layout seed
    seedNoise(seed || 444);

    const swatches = palette?.swatches || ['#ffffff'];

    for (let i = 0; i < count; i++) {
      const x = Math.random() * canvasW;
      const y = Math.random() * canvasH;
      const assetIdx = i % activeAssets.length;
      const color = swatches[i % swatches.length];
      const mass = Math.random() * 0.8 + 0.4; // mass between 0.4 and 1.2
      
      this.particles.push(new Particle(x, y, assetIdx, color, mass));
    }
  }

  /**
   * Main simulation step ticking at 60fps.
   * Resolves wind fields, flocking steering, attractor gravity, and damping.
   */
  update(layoutParams, activeAssets, palette, seed, time, attractor) {
    if (this.particles.length === 0) return;

    // Sync count dynamic adjustments
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

    const nt = time * noiseSpeed * 0.001; // time dimension for noise

    const sepRadius = 35;
    const aliRadius = 60;
    const cohRadius = 70;

    const separationWeight = 1.8;
    const alignmentWeight = 1.0;
    const cohesionWeight = swarmCohesion;

    // Pre-calculate flocking factors to prevent O(N^2) double-computations
    const numParticles = this.particles.length;

    for (let i = 0; i < numParticles; i++) {
      const p1 = this.particles[i];

      // Wind force computed using Simplex Flow Field
      const n = noise3D(p1.x * noiseFreq, p1.y * noiseFreq, nt + p1.seedOffset * 0.0001);
      const windAngle = n * Math.PI * 2;
      const windMag = (noise3D(p1.x * noiseFreq + 200, p1.y * noiseFreq + 200, nt) + 1.0) * 0.4;
      p1.applyForce(Math.cos(windAngle) * windMag, Math.sin(windAngle) * windMag);

      // Mouse pointer attractor gravity pull
      if (attractor && gravityWells > 0) {
        const dx = attractor.x - p1.x;
        const dy = attractor.y - p1.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        
        if (d > 5) {
          // Attract force scaled by gravityWells and mass
          const forceMag = (gravityWells * 0.25) / Math.max(20, d * 0.05);
          p1.applyForce((dx / d) * forceMag, (dy / d) * forceMag);
        }
      }

      // Reynolds flocking variables
      let sepX = 0, sepY = 0, sepCount = 0;
      let aliX = 0, aliY = 0, aliCount = 0;
      let cohX = 0, cohY = 0, cohCount = 0;

      for (let j = 0; j < numParticles; j++) {
        if (i === j) continue;
        const p2 = this.particles[j];

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const d = Math.sqrt(dx * dx + dy * dy);

        if (d > 0 && d < sepRadius) {
          // Point away from neighbor
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

      // Apply separation force
      if (sepCount > 0) {
        sepX /= sepCount;
        sepY /= sepCount;
        const mag = Math.sqrt(sepX * sepX + sepY * sepY);
        if (mag > 0) {
          p1.applyForce((sepX / mag) * separationWeight, (sepY / mag) * separationWeight);
        }
      }

      // Apply alignment force
      if (aliCount > 0) {
        aliX /= aliCount;
        aliY /= aliCount;
        const mag = Math.sqrt(aliX * aliX + aliY * aliY);
        if (mag > 0) {
          p1.applyForce((aliX / mag) * alignmentWeight, (aliY / mag) * alignmentWeight);
        }
      }

      // Apply cohesion force (steer to center of mass)
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

    // Step Newtonian integration & resolve bounding wraps
    const pad = 120; // bounding pad so assets flow off-screen cleanly
    const limitL = -pad;
    const limitR = this.canvasW + pad;
    const limitT = -pad;
    const limitB = this.canvasH + pad;

    for (let i = 0; i < numParticles; i++) {
      const p = this.particles[i];

      // Integrate
      p.vx = (p.vx + p.ax) * damping;
      p.vy = (p.vy + p.ay) * damping;
      
      // Speed clamps to prevent physical numerical explosions
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const maxSpeed = 8.0;
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }

      p.x += p.vx;
      p.y += p.vy;

      // Reset acceleration accumulator
      p.ax = 0;
      p.ay = 0;

      // Align rotation to movement vector
      if (speed > 0.1) {
        p.rotation = Math.atan2(p.vy, p.vx) * (180 / Math.PI);
      }

      // Dynamic scales and alphas based on mass relative to bounds
      p.scale = minScale + (p.mass * (maxScale - minScale));
      p.alpha = minAlpha + (p.mass * (maxAlpha - minAlpha));

      // Boundary wraps
      if (p.x < limitL) p.x = limitR;
      else if (p.x > limitR) p.x = limitL;

      if (p.y < limitT) p.y = limitB;
      else if (p.y > limitB) p.y = limitT;
    }
  }

  /**
   * Fetches particles mapped to their corresponding SVG asset configurations.
   */
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
