// TEST-ONLY reference implementation of the pre-SoA swarm engine.
//
// This is app/src/engine/particles.js as it stood at commit 8fc10ea, before
// the #108 swarm SoA rewrite, with only the class renamed and a header added.
// particles.selfcheck.mjs runs it side by side with the real engine and
// asserts they agree exactly.
//
// Why a reference implementation rather than recorded hashes: the swarm's
// output depends on Math.sin/cos/atan2, which ECMAScript does not require to
// be correctly rounded. V8 produces different results for them on x64 and
// arm64, so a hash captured on one machine fails on the other — as CI proved.
// Comparing the two implementations in the SAME process cancels that out and
// tests the property we actually care about ("the rewrite changed nothing")
// instead of a constant that also encodes the machine that recorded it.
//
// Do not "fix" this file to match the new engine. If they disagree, the new
// engine is what changed.

import { createNoise } from './noise.js';
import { CH, rngForIndex } from './kernel/rng.js';
import { isOrganismMode } from '../data/layout-modes.js';
import { resolveBehave, orbitForce } from './organisms/behave.js';

const ATTRACTOR_GAIN = 8;
const TAU = Math.PI * 2;
// Spine C (#389): MAX_TURN_DEG becomes deg/second. 10 deg/frame at 60 Hz = 600 deg/s.
const MAX_TURN_DEG_PER_SEC = 600;
const MAX_SPEED_CLOUD = 8.0;
const MAX_SPEED_MOTH = 1.65;
const BOUNCE = 0.62;
const MARGIN = 8;

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

function bounceAxis(pos, vel, min, max) {
  if (pos < min) return { pos: min, vel: Math.abs(vel) * BOUNCE };
  if (pos > max) return { pos: max, vel: -Math.abs(vel) * BOUNCE };
  return { pos, vel };
}

export class ReferenceParticleSystem {
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
      const x = MARGIN + r() * Math.max(1, canvasW - MARGIN * 2);
      const y = MARGIN + r() * Math.max(1, canvasH - MARGIN * 2);
      this.particles.push(new Particle(
        x, y, i % activeAssets.length, swatches[i % swatches.length],
        r() * 0.8 + 0.4, r() * TAU, r() * 0.55 + 0.15, r() * 10000,
      ));
    }
  }

  _buildSpatialHash(cellSize) {
    const grid = new Map();
    const key = (cx, cy) => `${cx},${cy}`;
    for (const p of this.particles) {
      const k = key(Math.floor(p.x / cellSize), Math.floor(p.y / cellSize));
      let bucket = grid.get(k);
      if (!bucket) { bucket = []; grid.set(k, bucket); }
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
    if (layoutParams.noise) {
      this._noise = layoutParams.noise;
    } else if (!this._noise) {
      this._noise = createNoise(seed || 444);
    }
    const noise = this._noise;
    const domainOffsetX = Number(layoutParams.noiseDomainOffsetX ?? layoutParams.noiseDomainOffset) || 0;
    const domainOffsetY = Number(layoutParams.noiseDomainOffsetY ?? layoutParams.noiseDomainOffset) || 0;
    const {
      noiseFreq = 0.005, noiseSpeed = 0.5, swarmCohesion = 1.5,
      gravityWells = 1.0, damping = 0.95, scale = [0.4, 1.6], alpha = [40, 100],
      wind = 1, body = 3, tight = 0.55,
    } = layoutParams;

    const organism = isOrganismMode(layoutParams.mode);
    const profile = organism ? resolveBehave(layoutParams.behave) : null;
    const maxSpeed = organism ? MAX_SPEED_MOTH : MAX_SPEED_CLOUD;
    const damp = organism ? Math.max(damping, 0.97) : damping;
    const [minScale, maxScale] = scale;
    const [minAlpha, maxAlpha] = alpha;
    const nt = time * noiseSpeed * 0.001;
    const windMul = organism ? wind * profile.wind : 1;

    let useCurl = false;
    if (layoutParams.windMode === 'curl' || layoutParams.windType === 'curl') {
      useCurl = true;
    } else if (layoutParams.windMode === 'point' || layoutParams.windType === 'point') {
      useCurl = false;
    } else {
      const behave = layoutParams.behave;
      const mode = layoutParams.mode;
      if (behave === 'flock' || behave === 'mold' || mode === 'murmuration') {
        useCurl = true;
      } else {
        useCurl = false;
      }
    }

    const sepRadius = organism ? profile.sepR : 35;
    const aliRadius = organism ? profile.aliR : 60;
    const cohRadius = organism ? profile.cohR : 70;
    // #509 phase 1 — MOD steering mirror (see particles.js): identity default.
    const steer = layoutParams.modSteer || null;
    const steerAli = steer && Number.isFinite(Number(steer.ali)) ? Number(steer.ali) : 1;
    const steerCoh = steer && Number.isFinite(Number(steer.coh)) ? Number(steer.coh) : 1;
    const steerSep = steer && Number.isFinite(Number(steer.sep)) ? Number(steer.sep) : 1;
    const sepW = (organism ? profile.sep : 1.8) * steerSep;
    const aliW = (organism ? profile.ali : 1.0) * steerAli;
    const cohW = (organism ? profile.coh : swarmCohesion) * steerCoh;
    const attractMul = organism ? profile.attract : 1;
    const maxRadius = Math.max(sepRadius, aliRadius, cohRadius);
    const numParticles = this.particles.length;
    const { grid, key, cellSize } = this._buildSpatialHash(maxRadius);
    const cx0 = this.canvasW / 2;
    const cy0 = this.canvasH / 2;

    for (let i = 0; i < numParticles; i++) {
      const p1 = this.particles[i];
      if (useCurl) {
        const c = noise.curl2(
          p1.x * noiseFreq + domainOffsetX,
          p1.y * noiseFreq + domainOffsetY,
          nt + p1.seedOffset * 0.0001,
        );
        p1.applyForce(c.x * 0.8 * windMul, c.y * 0.8 * windMul);
      } else {
        const n = noise.noise3D(
          p1.x * noiseFreq + domainOffsetX,
          p1.y * noiseFreq + domainOffsetY,
          nt + p1.seedOffset * 0.0001,
        );
        const windAngle = n * TAU;
        const windMag = (noise.noise3D(
          p1.x * noiseFreq + 200 + domainOffsetX,
          p1.y * noiseFreq + 200 + domainOffsetY,
          nt,
        ) + 1.0) * 0.4 * windMul;
        p1.applyForce(Math.cos(windAngle) * windMag, Math.sin(windAngle) * windMag);
      }
      if (organism && profile.orbit) {
        const o = orbitForce(p1.x, p1.y, cx0, cy0, profile.orbit);
        p1.applyForce(o.fx, o.fy);
      }
      if (attractor && gravityWells > 0 && attractMul > 0) {
        const dx = attractor.x - p1.x;
        const dy = attractor.y - p1.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 5) {
          const forceMag = (gravityWells * attractMul * ATTRACTOR_GAIN) / Math.max(20, d * 0.05);
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
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0 && dist < sepRadius) { sepX -= dx / dist; sepY -= dy / dist; sepCount++; }
            if (dist > 0 && dist < aliRadius) { aliX += p2.vx; aliY += p2.vy; aliCount++; }
            if (dist > 0 && dist < cohRadius) { cohX += p2.x; cohY += p2.y; cohCount++; }
          }
        }
      }
      if (sepCount > 0) {
        const mag = Math.sqrt(sepX * sepX + sepY * sepY) || 1;
        p1.applyForce((sepX / sepCount / mag) * sepW * sepCount, (sepY / sepCount / mag) * sepW * sepCount);
      }
      if (aliCount > 0 && aliW) {
        const mag = Math.sqrt(aliX * aliX + aliY * aliY) || 1;
        p1.applyForce((aliX / aliCount / mag) * aliW * aliCount, (aliY / aliCount / mag) * aliW * aliCount);
      }
      if (cohCount > 0 && cohW) {
        const steerX = cohX / cohCount - p1.x;
        const steerY = cohY / cohCount - p1.y;
        const mag = Math.sqrt(steerX * steerX + steerY * steerY) || 1;
        p1.applyForce((steerX / mag) * cohW, (steerY / mag) * cohW);
      }
    }

    const pad = 120;
    const bodyLen = Math.max(1, Math.min(7, Math.round(body || 1)));
    const follow = Math.max(0.05, Math.min(0.95, tight));

    for (let i = 0; i < numParticles; i++) {
      const p = this.particles[i];
      p.vx = (p.vx + p.ax) * damp;
      p.vy = (p.vy + p.ay) * damp;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > maxSpeed) {
        p.vx = (p.vx / speed) * maxSpeed;
        p.vy = (p.vy / speed) * maxSpeed;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.ax = 0;
      p.ay = 0;
      if (speed > 0.04) {
        const next = Math.atan2(p.vy, p.vx) * (180 / Math.PI);
        if (organism) {
          let dlt = next - p.rotation;
          while (dlt > 180) dlt -= 360;
          while (dlt < -180) dlt += 360;
          let step = dlt;
          const motionSmoothing = layoutParams.motionSmoothing !== undefined ? layoutParams.motionSmoothing : true;
          if (motionSmoothing !== false) {
            const lambdaScale = typeof motionSmoothing === 'number' ? Math.max(0, motionSmoothing) : 1.0;
            const baseLambda = profile?.lambda || (layoutParams.behave === 'scatter' ? 16 : 10);
            const lambda = baseLambda * lambdaScale;
            step = dlt * (1 - Math.exp(-lambda * (1 / 60)));
          }
          const maxTurn = MAX_TURN_DEG_PER_SEC * (1 / 60);
          if (step > maxTurn) step = maxTurn;
          if (step < -maxTurn) step = -maxTurn;
          p.rotation += step;
        } else p.rotation = next;
      }
      p.scale = minScale + (p.mass * (maxScale - minScale));
      p.alpha = minAlpha + (p.mass * (maxAlpha - minAlpha));
      p.phase = (p.phase + 0.004 * noiseSpeed) % 1;
      const spdU = Math.max(0, Math.min(1, speed / maxSpeed));
      if (organism) {
        const flapU = 0.5 + 0.5 * Math.sin(p.phase * TAU + p.seedOffset);
        p.u = Math.max(0, Math.min(1, 0.5 * flapU + 0.5 * spdU));
      } else {
        p.u = spdU;
      }
      if (organism) {
        const bx = bounceAxis(p.x, p.vx, MARGIN, this.canvasW - MARGIN);
        const by = bounceAxis(p.y, p.vy, MARGIN, this.canvasH - MARGIN);
        p.x = bx.pos; p.vx = bx.vel;
        p.y = by.pos; p.vy = by.vel;
        if (!p.spine || !p.spine.length) p.spine = [{ x: p.x, y: p.y }];
        const head = { x: p.x, y: p.y };
        const nextSpine = [head];
        for (let s = 1; s < bodyLen; s++) {
          const prev = nextSpine[s - 1];
          const cur = p.spine[s] || p.spine[p.spine.length - 1] || head;
          nextSpine.push({ x: cur.x + (prev.x - cur.x) * follow, y: cur.y + (prev.y - cur.y) * follow });
        }
        p.spine = nextSpine;
      } else {
        if (p.x < -pad) p.x = this.canvasW + pad;
        else if (p.x > this.canvasW + pad) p.x = -pad;
        if (p.y < -pad) p.y = this.canvasH + pad;
        else if (p.y > this.canvasH + pad) p.y = -pad;
      }
    }
  }

  getItems(activeAssets) {
    if (!activeAssets || activeAssets.length === 0) return [];
    const lp = this._layout || {};
    if (!isOrganismMode(lp.mode)) {
      return this.particles.map((p) => ({
        x: p.x, y: p.y, scale: p.scale, rotation: p.rotation, alpha: p.alpha,
        asset: activeAssets[p.assetIndex % activeAssets.length], color: p.color, u: p.u,
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
          x: pt.x, y: pt.y, scale: p.scale * (1 - s * 0.1), rotation: p.rotation,
          alpha: p.alpha * (1 - s * 0.08), asset, color: p.color, u: p.u,
          key: `o${i}-s${s}`, role: s === 0 ? 'body' : 'segment',
        });
      }
      if (symmetry === 'bilateral') {
        const heading = p.rotation * (Math.PI / 180);
        const px = Math.cos(heading);
        const py = Math.sin(heading);
        const amp = flap * Math.sin(p.phase * TAU + p.seedOffset);
        const reach = 16 + Math.abs(amp) * 20;
        items.push({
          x: p.x - py * reach, y: p.y + px * reach,
          scale: p.scale * 0.7, rotation: p.rotation + amp * 18,
          alpha: p.alpha, asset, color: p.color, u: p.u, key: `o${i}-wl`, role: 'wing',
        });
        items.push({
          x: p.x + py * reach, y: p.y - px * reach,
          scale: p.scale * 0.7, rotation: p.rotation - amp * 18,
          alpha: p.alpha, asset, color: p.color, u: p.u, key: `o${i}-wr`, role: 'wing', _mirrored: true,
        });
      }
    }
    return items;
  }
}
