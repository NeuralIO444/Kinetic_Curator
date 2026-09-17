/**
 * particles.js — swarm cloud + hype organisms.
 * Organism weights live in organisms/behave.js — not inline magic.
 *
 * Kernel v2 (#108) swarm SoA. Two changes, both measured (see
 * docs/KERNEL_V1_PLAN.md §16):
 *
 *   1. Particle state lives in parallel typed arrays instead of one heap
 *      object per particle. The boids neighbour loop reads x/y/vx/vy for
 *      ~25 neighbours per particle per step; as objects that is a pointer
 *      chase per neighbour into scattered heap memory, as columns it is a
 *      contiguous read.
 *   2. The spatial hash is a counting-sort uniform grid over Int32Arrays
 *      instead of a Map keyed by `${cx},${cy}`. The old version allocated a
 *      fresh key string for all nine neighbour cells of every particle on
 *      every step — 3.9M string allocations across a 400x120 bake.
 *
 * Both preserve behaviour EXACTLY, which is the reason the grid is built the
 * way it is below: neighbours are visited in the same order as the Map
 * version (ox outer, oy inner; within a cell, ascending particle index), and
 * the grid is sized to the particles' actual cell extent rather than clamped
 * to the canvas. Float addition is not associative, so any reordering of the
 * separation/alignment/cohesion sums would perturb the last bits and, over
 * 120 steps of a chaotic system, produce a visibly different swarm.
 * particles.selfcheck.mjs pins five configurations to hashes captured from
 * the pre-SoA implementation.
 */

import { createNoise } from './noise.js';
import { CH, rngForIndex } from './kernel/rng.js';
import { MOTH_LADDERS } from '../data/bodies/demoLadder.js';
import { isOrganismMode } from '../data/layout-modes.js';
import { resolveBehave, orbitForce } from './organisms/behave.js';

export const ATTRACTOR_GAIN = 8;
const TAU = Math.PI * 2;
const MAX_TURN_DEG = 10;
const MAX_SPEED_CLOUD = 8.0;
const MAX_SPEED_MOTH = 1.65;
const BOUNCE = 0.62;
const MARGIN = 8;

export class ParticleSystem {
  constructor() {
    this.n = 0;
    this.canvasW = 1000;
    this.canvasH = 700;
    this._noise = null;
    this._layout = null;
    this._cap = 0;
    this._allocate(0);
    // Cold columns — never touched by the physics inner loops.
    this.color = [];
    this.spine = [];
    this._grid = null;
  }

  /** Hot columns. Float64, not Float32: these carry the simulation state
   *  forward step to step, and narrowing would compound rounding error
   *  across 120+ integrations as well as breaking the behaviour hashes. */
  _allocate(cap) {
    this._cap = cap;
    this.x = new Float64Array(cap);
    this.y = new Float64Array(cap);
    this.vx = new Float64Array(cap);
    this.vy = new Float64Array(cap);
    this.ax = new Float64Array(cap);
    this.ay = new Float64Array(cap);
    this.mass = new Float64Array(cap);
    this.scale = new Float64Array(cap);
    this.rotation = new Float64Array(cap);
    this.alpha = new Float64Array(cap);
    this.phase = new Float64Array(cap);
    this.u = new Float64Array(cap);
    this.seedOffset = new Float64Array(cap);
    this.assetIndex = new Int32Array(cap);
    // Grid scratch, reallocated with the population.
    this._cellOf = new Int32Array(cap);
    this._order = new Int32Array(cap);
  }

  physicsCount() {
    return this.n;
  }

  resetPhase() {
    this.phase.fill(0, 0, this.n);
  }

  init(count, canvasW, canvasH, activeAssets, palette, seed) {
    this.canvasW = canvasW;
    this.canvasH = canvasH;
    this._noise = createNoise(seed || 444);
    if (!activeAssets || activeAssets.length === 0) {
      this.n = 0;
      this.color = [];
      this.spine = [];
      return;
    }
    if (count > this._cap) this._allocate(count);
    this.n = count;
    this.color = new Array(count);
    this.spine = new Array(count);
    const swatches = palette?.swatches || ['#ffffff'];
    for (let i = 0; i < count; i++) {
      // Draw order here is load-bearing: r() is a sequential stream, so the
      // six draws below must stay in this order to reproduce a given seed.
      const r = rngForIndex(seed >>> 0, CH.dyn, i);
      const x = MARGIN + r() * Math.max(1, canvasW - MARGIN * 2);
      const y = MARGIN + r() * Math.max(1, canvasH - MARGIN * 2);
      const mass = r() * 0.8 + 0.4;
      const angle = r() * TAU;
      const speed = r() * 0.55 + 0.15;
      const seedOffset = r() * 10000;

      this.x[i] = x;
      this.y[i] = y;
      this.vx[i] = Math.cos(angle) * speed;
      this.vy[i] = Math.sin(angle) * speed;
      this.ax[i] = 0;
      this.ay[i] = 0;
      this.mass[i] = mass;
      this.scale[i] = mass;
      this.rotation[i] = angle * (180 / Math.PI);
      this.alpha[i] = 0;
      this.phase[i] = 0;
      this.u[i] = 0;
      this.seedOffset[i] = seedOffset;
      this.assetIndex[i] = i % activeAssets.length;
      this.color[i] = swatches[i % swatches.length];
      this.spine[i] = [{ x, y }];
    }
  }

  /**
   * Counting-sort uniform grid.
   *
   * Sized to the particles' actual cell extent, NOT clamped to the canvas:
   * cloud particles wrap at ±120px, so their cell coordinates go negative,
   * and clamping would merge out-of-bounds cells into the edge ones and
   * change who counts as a neighbour. An empty cell yields start === end,
   * which is exactly what a Map miss did before.
   */
  _buildSpatialHash(cellSize) {
    const n = this.n;
    const cellOf = this._cellOf;

    let minCx = Infinity; let minCy = Infinity;
    let maxCx = -Infinity; let maxCy = -Infinity;
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(this.x[i] / cellSize);
      const cy = Math.floor(this.y[i] / cellSize);
      if (cx < minCx) minCx = cx;
      if (cx > maxCx) maxCx = cx;
      if (cy < minCy) minCy = cy;
      if (cy > maxCy) maxCy = cy;
    }
    if (n === 0) { minCx = 0; minCy = 0; maxCx = 0; maxCy = 0; }

    const cols = maxCx - minCx + 1;
    const rows = maxCy - minCy + 1;
    const numCells = cols * rows;

    // +1 so cellStart[c+1] is readable for the last cell.
    let cellStart = this._cellStart;
    if (!cellStart || cellStart.length < numCells + 1) {
      cellStart = new Int32Array(numCells + 1);
      this._cellStart = cellStart;
    } else {
      cellStart.fill(0, 0, numCells + 1);
    }

    for (let i = 0; i < n; i++) {
      const cx = Math.floor(this.x[i] / cellSize) - minCx;
      const cy = Math.floor(this.y[i] / cellSize) - minCy;
      const c = cy * cols + cx;
      cellOf[i] = c;
      cellStart[c + 1]++;
    }
    for (let c = 0; c < numCells; c++) cellStart[c + 1] += cellStart[c];

    // Scatter in ascending particle index so within-cell order matches the
    // old Map-of-arrays push order.
    let fill = this._fill;
    if (!fill || fill.length < numCells + 1) {
      fill = new Int32Array(numCells + 1);
      this._fill = fill;
    }
    fill.set(cellStart.subarray(0, numCells + 1));
    const order = this._order;
    for (let i = 0; i < n; i++) order[fill[cellOf[i]]++] = i;

    this._grid = { cellStart, order, cols, rows, minCx, minCy, cellSize };
    return this._grid;
  }

  update(layoutParams, activeAssets, palette, seed, time, attractor) {
    if (this.n === 0) return;
    this._layout = layoutParams;
    const targetCount = layoutParams.particleCount || 100;
    if (this.n !== targetCount) {
      this.init(targetCount, this.canvasW, this.canvasH, activeAssets, palette, seed);
    }
    if (!this._noise) this._noise = createNoise(seed || 444);
    const noise = this._noise;
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

    const sepRadius = organism ? profile.sepR : 35;
    const aliRadius = organism ? profile.aliR : 60;
    const cohRadius = organism ? profile.cohR : 70;
    const sepW = organism ? profile.sep : 1.8;
    const aliW = organism ? profile.ali : 1.0;
    const cohW = organism ? profile.coh : swarmCohesion;
    const attractMul = organism ? profile.attract : 1;
    const maxRadius = Math.max(sepRadius, aliRadius, cohRadius);
    const maxRadius2 = maxRadius * maxRadius;
    const sepRadius2 = sepRadius * sepRadius;
    const aliRadius2 = aliRadius * aliRadius;
    const cohRadius2 = cohRadius * cohRadius;
    const numParticles = this.n;
    const { cellStart, order, cols, rows, minCx, minCy, cellSize } = this._buildSpatialHash(maxRadius);
    const cx0 = this.canvasW / 2;
    const cy0 = this.canvasH / 2;

    // Hoist the columns the inner loops touch. Property loads off `this`
    // inside a 3-deep loop are the one thing SoA can still get wrong.
    const X = this.x; const Y = this.y;
    const VX = this.vx; const VY = this.vy;
    const AX = this.ax; const AY = this.ay;
    const MASS = this.mass;

    for (let i = 0; i < numParticles; i++) {
      const pxi = X[i];
      const pyi = Y[i];
      const m = MASS[i];
      let fax = AX[i];
      let fay = AY[i];

      const nval = noise.noise3D(pxi * noiseFreq, pyi * noiseFreq, nt + this.seedOffset[i] * 0.0001);
      const windAngle = nval * TAU;
      const windMag = (noise.noise3D(pxi * noiseFreq + 200, pyi * noiseFreq + 200, nt) + 1.0) * 0.4 * windMul;
      fax += (Math.cos(windAngle) * windMag) / m;
      fay += (Math.sin(windAngle) * windMag) / m;

      if (organism && profile.orbit) {
        const o = orbitForce(pxi, pyi, cx0, cy0, profile.orbit);
        fax += o.fx / m;
        fay += o.fy / m;
      }
      if (attractor && gravityWells > 0 && attractMul > 0) {
        const dx = attractor.x - pxi;
        const dy = attractor.y - pyi;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 5) {
          const forceMag = (gravityWells * attractMul * ATTRACTOR_GAIN) / Math.max(20, d * 0.05);
          fax += ((dx / d) * forceMag) / m;
          fay += ((dy / d) * forceMag) / m;
        }
      }

      let sepX = 0; let sepY = 0; let sepCount = 0;
      let aliX = 0; let aliY = 0; let aliCount = 0;
      let cohX = 0; let cohY = 0; let cohCount = 0;
      const cx = Math.floor(pxi / cellSize) - minCx;
      const cy = Math.floor(pyi / cellSize) - minCy;
      // ox outer, oy inner — the Map version's visit order. Changing it
      // reorders the float sums below and moves the behaviour hashes.
      for (let ox = -1; ox <= 1; ox++) {
        const ncx = cx + ox;
        if (ncx < 0 || ncx >= cols) continue;
        for (let oy = -1; oy <= 1; oy++) {
          const ncy = cy + oy;
          if (ncy < 0 || ncy >= rows) continue;
          const c = ncy * cols + ncx;
          const end = cellStart[c + 1];
          for (let k = cellStart[c]; k < end; k++) {
            const j = order[k];
            if (j === i) continue;
            const dx = X[j] - pxi;
            const dy = Y[j] - pyi;
            const d2 = dx * dx + dy * dy;
            // A 3x3 block of maxRadius-sized cells is a 3r x 3r square, but
            // only the radius-r disc can contribute — about 65% of candidates
            // are out of range. Rejecting on squared distance skips their
            // sqrt entirely.
            //
            // Exact, not approximate: sqrt is correctly rounded, so for
            // d2 >= maxRadius2 the sqrt is >= maxRadius (or rounds to exactly
            // maxRadius), and every `dist < radius` test below is false for
            // all three radii. Skipping contributes the same nothing.
            if (d2 >= maxRadius2) continue;
            // Alignment/cohesion only test "is this neighbour within radius"
            // — a squared-distance compare answers that without a sqrt.
            // Separation needs the actual unit vector (dx/dist, dy/dist), so
            // it alone pays for the real sqrt, and only when it is in range.
            if (d2 > 0 && d2 < sepRadius2) {
              const dist = Math.sqrt(d2);
              sepX -= dx / dist; sepY -= dy / dist; sepCount++;
            }
            if (d2 > 0 && d2 < aliRadius2) { aliX += VX[j]; aliY += VY[j]; aliCount++; }
            if (d2 > 0 && d2 < cohRadius2) { cohX += X[j]; cohY += Y[j]; cohCount++; }
          }
        }
      }
      if (sepCount > 0) {
        const mag = Math.sqrt(sepX * sepX + sepY * sepY) || 1;
        fax += ((sepX / sepCount / mag) * sepW * sepCount) / m;
        fay += ((sepY / sepCount / mag) * sepW * sepCount) / m;
      }
      if (aliCount > 0 && aliW) {
        const mag = Math.sqrt(aliX * aliX + aliY * aliY) || 1;
        fax += ((aliX / aliCount / mag) * aliW * aliCount) / m;
        fay += ((aliY / aliCount / mag) * aliW * aliCount) / m;
      }
      if (cohCount > 0 && cohW) {
        const steerX = cohX / cohCount - pxi;
        const steerY = cohY / cohCount - pyi;
        const mag = Math.sqrt(steerX * steerX + steerY * steerY) || 1;
        fax += ((steerX / mag) * cohW) / m;
        fay += ((steerY / mag) * cohW) / m;
      }
      AX[i] = fax;
      AY[i] = fay;
    }

    const pad = 120;
    const bodyLen = Math.max(1, Math.min(7, Math.round(body || 1)));
    const follow = Math.max(0.05, Math.min(0.95, tight));

    for (let i = 0; i < numParticles; i++) {
      let vxi = (VX[i] + AX[i]) * damp;
      let vyi = (VY[i] + AY[i]) * damp;
      const speed = Math.sqrt(vxi * vxi + vyi * vyi);
      if (speed > maxSpeed) {
        vxi = (vxi / speed) * maxSpeed;
        vyi = (vyi / speed) * maxSpeed;
      }
      let pxi = X[i] + vxi;
      let pyi = Y[i] + vyi;
      AX[i] = 0;
      AY[i] = 0;
      if (speed > 0.04) {
        const next = Math.atan2(vyi, vxi) * (180 / Math.PI);
        if (organism) {
          let dlt = next - this.rotation[i];
          while (dlt > 180) dlt -= 360;
          while (dlt < -180) dlt += 360;
          if (dlt > MAX_TURN_DEG) dlt = MAX_TURN_DEG;
          if (dlt < -MAX_TURN_DEG) dlt = -MAX_TURN_DEG;
          this.rotation[i] += dlt;
        } else this.rotation[i] = next;
      }
      const mi = MASS[i];
      this.scale[i] = minScale + (mi * (maxScale - minScale));
      this.alpha[i] = minAlpha + (mi * (maxAlpha - minAlpha));
      const ph = (this.phase[i] + 0.004 * noiseSpeed) % 1;
      this.phase[i] = ph;
      const spdU = Math.max(0, Math.min(1, speed / maxSpeed));
      if (organism) {
        const flapU = 0.5 + 0.5 * Math.sin(ph * TAU + this.seedOffset[i]);
        this.u[i] = Math.max(0, Math.min(1, 0.5 * flapU + 0.5 * spdU));
      } else {
        this.u[i] = spdU;
      }
      if (organism) {
        if (pxi < MARGIN) { pxi = MARGIN; vxi = Math.abs(vxi) * BOUNCE; }
        else if (pxi > this.canvasW - MARGIN) { pxi = this.canvasW - MARGIN; vxi = -Math.abs(vxi) * BOUNCE; }
        if (pyi < MARGIN) { pyi = MARGIN; vyi = Math.abs(vyi) * BOUNCE; }
        else if (pyi > this.canvasH - MARGIN) { pyi = this.canvasH - MARGIN; vyi = -Math.abs(vyi) * BOUNCE; }

        let sp = this.spine[i];
        if (!sp || !sp.length) sp = [{ x: pxi, y: pyi }];
        const head = { x: pxi, y: pyi };
        const nextSpine = [head];
        for (let s = 1; s < bodyLen; s++) {
          const prev = nextSpine[s - 1];
          const cur = sp[s] || sp[sp.length - 1] || head;
          nextSpine.push({ x: cur.x + (prev.x - cur.x) * follow, y: cur.y + (prev.y - cur.y) * follow });
        }
        this.spine[i] = nextSpine;
      } else {
        if (pxi < -pad) pxi = this.canvasW + pad;
        else if (pxi > this.canvasW + pad) pxi = -pad;
        if (pyi < -pad) pyi = this.canvasH + pad;
        else if (pyi > this.canvasH + pad) pyi = -pad;
      }
      X[i] = pxi;
      Y[i] = pyi;
      VX[i] = vxi;
      VY[i] = vyi;
    }
  }

  getItems(activeAssets) {
    if (!activeAssets || activeAssets.length === 0) return [];
    const lp = this._layout || {};
    if (!isOrganismMode(lp.mode)) {
      const items = new Array(this.n);
      for (let i = 0; i < this.n; i++) {
        items[i] = {
          x: this.x[i], y: this.y[i], scale: this.scale[i],
          rotation: this.rotation[i], alpha: this.alpha[i],
          asset: activeAssets[this.assetIndex[i] % activeAssets.length],
          color: this.color[i], u: this.u[i],
        };
      }
      return items;
    }
    return this._organismItems(activeAssets, lp);
  }

  _organismItems(activeAssets, lp) {
    const bodyLen = Math.max(1, Math.min(7, Math.round(lp.body || 1)));
    const flap = Number.isFinite(lp.flap) ? lp.flap : 0.35;
    const symmetry = lp.symmetry || 'none';
    const items = [];
    for (let i = 0; i < this.n; i++) {
      const asset = activeAssets[this.assetIndex[i] % activeAssets.length];
      const px = this.x[i];
      const py = this.y[i];
      const pscale = this.scale[i];
      const protation = this.rotation[i];
      const palpha = this.alpha[i];
      const pu = this.u[i];
      const pcolor = this.color[i];
      const sp = this.spine[i] && this.spine[i].length ? this.spine[i] : [{ x: px, y: py }];
      for (let s = 0; s < bodyLen; s++) {
        const pt = sp[Math.min(s, sp.length - 1)];
        items.push({
          x: pt.x, y: pt.y, scale: pscale * (1 - s * 0.1), rotation: protation,
          alpha: palpha * (1 - s * 0.08), asset, color: pcolor, u: pu,
          key: `o${i}-s${s}`, role: s === 0 ? 'body' : 'segment',
        });
      }
      if (symmetry === 'bilateral') {
        const heading = protation * (Math.PI / 180);
        const pxh = Math.cos(heading);
        const pyh = Math.sin(heading);
        const amp = flap * Math.sin(this.phase[i] * TAU + this.seedOffset[i]);
        const reach = 16 + Math.abs(amp) * 20;
        // #109A — one blend ladder per moth, round-robin over the shipped set.
        const ladderId = MOTH_LADDERS[i % MOTH_LADDERS.length].id;
        items.push({
          x: px - pyh * reach, y: py + pxh * reach,
          scale: pscale * 0.7, rotation: protation + amp * 18,
          alpha: palpha, asset, color: pcolor, u: pu, key: `o${i}-wl`, role: 'wing',
          ladderId,
        });
        items.push({
          x: px + pyh * reach, y: py - pxh * reach,
          scale: pscale * 0.7, rotation: protation - amp * 18,
          alpha: palpha, asset, color: pcolor, u: pu, key: `o${i}-wr`, role: 'wing', _mirrored: true,
          ladderId,
        });
      }
    }
    return items;
  }
}
