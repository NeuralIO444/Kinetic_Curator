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
import { CH, hashU01, rngForIndex } from './kernel/rng.js';
import { MOTH_LADDERS } from '../data/bodies/demoLadder.js';
import { CONTACT_MODES, isOrganismMode } from '../data/layout-modes.js';
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
    // Contact state (#167). alive gates every loop; _dead is the freelist
    // `die` recycles into and `breed` consumes from.
    this._dead = [];
    this._breedSeq = 0;
    // Authored population from the last init — tracked separately from the
    // runtime population (this.n), which `breed` grows past the authored
    // count. update() re-inits only when the authored count changes, so
    // newborns survive to the next frame instead of being wiped.
    this._authoredCount = 0;
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
    // #167 — contact columns. alive is the live/dead gate (die/breed);
    // cgroup is the particle's collide layer, stable for its lifetime
    // (swap changes the costume, not the layer).
    this.alive = new Uint8Array(cap);
    this.cgroup = new Uint8Array(cap);
    // Grid scratch, reallocated with the population.
    this._cellOf = new Int32Array(cap);
    this._order = new Int32Array(cap);
  }

  /**
   * Grow every column, preserving state (#167 breed). _allocate is the
   * fresh-start path (init); this is the only path that copies.
   */
  _ensureCapacity(minCap) {
    if (minCap <= this._cap) return;
    const newCap = Math.max(minCap, this._cap * 2 || 16);
    const grow = (arr) => {
      const next = new arr.constructor(newCap);
      next.set(arr);
      return next;
    };
    this.x = grow(this.x);
    this.y = grow(this.y);
    this.vx = grow(this.vx);
    this.vy = grow(this.vy);
    this.ax = grow(this.ax);
    this.ay = grow(this.ay);
    this.mass = grow(this.mass);
    this.scale = grow(this.scale);
    this.rotation = grow(this.rotation);
    this.alpha = grow(this.alpha);
    this.phase = grow(this.phase);
    this.u = grow(this.u);
    this.seedOffset = grow(this.seedOffset);
    this.assetIndex = grow(this.assetIndex);
    this.alive = grow(this.alive);
    this.cgroup = grow(this.cgroup);
    this._cellOf = grow(this._cellOf);
    this._order = grow(this._order);
    this.color.length = newCap;
    this.spine.length = newCap;
    // _cellStart/_fill are sized per grid build; they reallocate as needed.
    this._cap = newCap;
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
      this._authoredCount = 0;
      this.color = [];
      this.spine = [];
      return;
    }
    if (count > this._cap) this._allocate(count);
    this.n = count;
    this._authoredCount = count;
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
      this.alive[i] = 1;
      this.cgroup[i] = (i % activeAssets.length) % 32;
      this.color[i] = swatches[i % swatches.length];
      this.spine[i] = [{ x, y }];
    }
    // A population (re)init clears all contact state: dead slots, the
    // breed sequence, and the freelist belong to the old population.
    this._dead = [];
    this._breedSeq = 0;
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
    const alive = this.alive;

    let minCx = Infinity; let minCy = Infinity;
    let maxCx = -Infinity; let maxCy = -Infinity;
    let live = 0;
    for (let i = 0; i < n; i++) {
      // #167 — dead particles (die) are not neighbours of anyone.
      if (!alive[i]) { cellOf[i] = -1; continue; }
      live++;
      const cx = Math.floor(this.x[i] / cellSize);
      const cy = Math.floor(this.y[i] / cellSize);
      if (cx < minCx) minCx = cx;
      if (cx > maxCx) maxCx = cx;
      if (cy < minCy) minCy = cy;
      if (cy > maxCy) maxCy = cy;
    }
    if (live === 0) { minCx = 0; minCy = 0; maxCx = 0; maxCy = 0; }

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
      if (!alive[i]) continue;
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
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue;
      order[fill[cellOf[i]]++] = i;
    }

    this._grid = { cellStart, order, cols, rows, minCx, minCy, cellSize };
    return this._grid;
  }

  /**
   * Contact integrator (#167) — the one integrator for organism contacts.
   * Runs between the force pass and the velocity/position integration, so
   * contact impulses flow through the same damping, speed clamp, and wall
   * handling as every other force. No Matter/cannon/Rapier, no rigid
   * stacks, no CCD, no 3D: one pairwise pass per step.
   *
   * Each particle is a disc of `radius` px. For every interacting pair with
   * dist < 2*radius, in a fixed visit order (ascending i; per i the same
   * ox-outer/oy-inner grid walk as the boids loop; each unordered pair once
   * from the lower index):
   *
   *   1. Positional depenetration — always, for every mode except none with
   *      radius 0 (the pass doesn't run at all then). Mass-weighted split,
   *      so `mass` is the hit response and assets genuinely occupy space.
   *   2. Velocity impulse — bounce (restitution 0–1) and stick (restitution
   *      0, perfectly inelastic) kill the approaching normal velocity.
   *   3. Repel — same-collide-group neighbours get extra separating
   *      velocity proportional to overlap: personal space, not a bounce.
   *   4. Events, on approach (vn < 0) only: swap exchanges assetIndex,
   *      die marks the higher-index particle dead (its index goes on the
   *      freelist), breed spawns a child into a dead slot or — only under
   *      the quality cap — a fresh one.
   *
   * Pair interaction is gated by collideMask: bit g set means collide-group
   * g participates. Determinism: the visit order is fixed, there is no
   * Math.random/Date.now anywhere in the pass, and breed's jitter comes
   * from hashU01(seed, CH.dyn, …) keyed by a per-system breed sequence, so
   * the same seed + params + step count always yields the same contacts.
   *
   * @param {object} ctx radius, restitution, repel, mode, umask, breedCap,
   *   seed, organism, minScale, maxScale, minAlpha, maxAlpha
   */
  _contactPass(ctx) {
    const {
      radius, restitution, repel, mode, umask, breedCap, seed, organism,
      minScale, maxScale, minAlpha, maxAlpha,
    } = ctx;
    const n0 = this.n;
    if (n0 < 2 || !(radius > 0)) return;
    // 3x3 cells of 2r cover every pair with dist < 2r. A second grid — the
    // boids grid keeps its exact cell size and visit order (behaviour lock).
    const { cellStart, order, cols, rows, minCx, minCy, cellSize } =
      this._buildSpatialHash(radius * 2);
    const X = this.x; const Y = this.y;
    const VX = this.vx; const VY = this.vy;
    const MASS = this.mass;
    const ALIVE = this.alive;
    const CG = this.cgroup;
    const AI = this.assetIndex;
    const rr = radius * 2;
    const rr2 = rr * rr;
    const canImpulse = mode === 'bounce' || mode === 'stick';
    // stick is bounce with restitution 0.
    const e = mode === 'bounce' ? restitution : 0;
    const wantSwap = mode === 'swap';
    const wantDie = mode === 'die';
    const wantBreed = mode === 'breed';
    // Slots born this pass (breed into a recycled index < n0) sit out the
    // rest of the pass: a newborn overlapping its parents must not breed
    // again before depenetration has had a step to push it clear.
    const newborn = new Set();

    for (let i = 0; i < n0; i++) {
      if (!ALIVE[i] || newborn.has(i)) continue;
      const ga = CG[i];
      if (!((umask >>> ga) & 1)) continue;
      const cx = Math.floor(X[i] / cellSize) - minCx;
      const cy = Math.floor(Y[i] / cellSize) - minCy;
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
            if (j <= i || !ALIVE[j] || newborn.has(j)) continue;
            const gb = CG[j];
            if (!((umask >>> gb) & 1)) continue;
            // Re-read: i may already have moved this pass.
            const xi = X[i]; const yi = Y[i];
            const dx = X[j] - xi;
            const dy = Y[j] - yi;
            const d2 = dx * dx + dy * dy;
            if (d2 >= rr2) continue;
            let dist = Math.sqrt(d2);
            let nx; let ny;
            if (dist > 1e-9) {
              nx = dx / dist; ny = dy / dist;
            } else {
              // Exactly coincident discs: deterministic golden-angle normal
              // from the index pair — never NaN, never random.
              const ang = (i * 2.399963229728653 + j * 1.2) % TAU;
              nx = Math.cos(ang); ny = Math.sin(ang);
              dist = 0;
            }
            const overlap = rr - dist;
            const m1 = MASS[i]; const m2 = MASS[j];
            const w1 = 1 / m1; const w2 = 1 / m2;
            const wSum = w1 + w2;
            // 1 — positional depenetration, mass-weighted.
            const corr = overlap / wSum;
            X[i] = xi - nx * corr * w1;
            Y[i] = yi - ny * corr * w1;
            X[j] = X[j] + nx * corr * w2;
            Y[j] = Y[j] + ny * corr * w2;
            // Relative normal velocity, pre-impulse.
            const vn = (VX[j] - VX[i]) * nx + (VY[j] - VY[i]) * ny;
            // 2 — bounce / stick impulse on approach.
            if (vn < 0 && canImpulse) {
              const jimp = (-(1 + e) * vn) / wSum;
              VX[i] -= nx * jimp * w1;
              VY[i] -= ny * jimp * w1;
              VX[j] += nx * jimp * w2;
              VY[j] += ny * jimp * w2;
            }
            // 3 — repel: same-layer personal space, extra separating
            // velocity scaled by overlap fraction. Independent of approach:
            // personal space pushes even when the pair is drifting apart.
            if (repel > 0 && ga === gb) {
              const jr = ((repel * (overlap / rr)) * 0.5) / wSum;
              VX[i] -= nx * jr * w1;
              VY[i] -= ny * jr * w1;
              VX[j] += nx * jr * w2;
              VY[j] += ny * jr * w2;
            }
            // 4 — events fire on approach only, so a resting pair doesn't
            // strobe its response every step.
            if (vn >= 0) continue;
            if (wantSwap) {
              const t = AI[i]; AI[i] = AI[j]; AI[j] = t;
            } else if (wantDie) {
              ALIVE[j] = 0;
              this._dead.push(j);
            } else if (wantBreed) {
              const cs = this._breed(
                i, j, seed, breedCap,
                minScale, maxScale, minAlpha, maxAlpha,
              );
              if (cs >= 0) newborn.add(cs);
            }
          }
        }
      }
    }

    if (organism) {
      // Contact depenetration moved heads after the spine was rebuilt;
      // re-pin segment 0 so the body doesn't lag the head by a frame.
      for (let s = 0; s < this.n; s++) {
        if (!ALIVE[s]) continue;
        const sp = this.spine[s];
        if (sp && sp.length) { sp[0].x = X[s]; sp[0].y = Y[s]; }
      }
    }
  }

  /**
   * Breed one child from parents i, j (#167). The child takes a dead slot
   * first (die recycles the index); it grows the population only under the
   * quality cap. It spawns at the parents' midpoint — overlapping both —
   * and the next step's depenetration pushes it clear. All jitter is
   * hashU01(seed, CH.dyn, …) keyed by a per-system breed sequence:
   * deterministic per seed and history.
   */
  _breed(i, j, seed, breedCap, minScale, maxScale, minAlpha, maxAlpha) {
    let cs;
    if (this._dead.length > 0) {
      cs = this._dead.pop();
    } else {
      if (this.n >= breedCap) return -1;
      this._ensureCapacity(this.n + 1);
      cs = this.n;
      this.n += 1;
    }
    const seq = this._breedSeq;
    this._breedSeq += 1;
    const r1 = hashU01(seed, CH.dyn, 7919 + seq * 4);
    const r2 = hashU01(seed, CH.dyn, 7920 + seq * 4);
    const r3 = hashU01(seed, CH.dyn, 7921 + seq * 4);
    const r4 = hashU01(seed, CH.dyn, 7922 + seq * 4);
    const m1 = this.mass[i]; const m2 = this.mass[j];
    const tm = m1 + m2;
    const mx = (this.x[i] + this.x[j]) / 2;
    const my = (this.y[i] + this.y[j]) / 2;
    const cm = tm / 2;
    const cvx = ((this.vx[i] * m1) + (this.vx[j] * m2)) / tm;
    const cvy = ((this.vy[i] * m1) + (this.vy[j] * m2)) / tm;
    this.x[cs] = mx;
    this.y[cs] = my;
    this.vx[cs] = cvx + (r1 - 0.5) * 0.6;
    this.vy[cs] = cvy + (r2 - 0.5) * 0.6;
    this.ax[cs] = 0;
    this.ay[cs] = 0;
    this.mass[cs] = cm;
    this.scale[cs] = minScale + cm * (maxScale - minScale);
    this.rotation[cs] = Math.atan2(cvy, cvx) * (180 / Math.PI);
    this.alpha[cs] = minAlpha + cm * (maxAlpha - minAlpha);
    this.phase[cs] = 0;
    this.u[cs] = 0;
    this.seedOffset[cs] = (this.seedOffset[i] + this.seedOffset[j]) / 2;
    // The child inherits one parent's costume and collide layer, seeded.
    this.assetIndex[cs] = r3 < 0.5 ? this.assetIndex[i] : this.assetIndex[j];
    this.cgroup[cs] = r4 < 0.5 ? this.cgroup[i] : this.cgroup[j];
    this.alive[cs] = 1;
    this.color[cs] = r3 < 0.5 ? this.color[i] : this.color[j];
    this.spine[cs] = [{ x: mx, y: my }];
    return cs;
  }

  update(layoutParams, activeAssets, palette, seed, time, attractor) {
    if (this.n === 0) return;
    this._layout = layoutParams;
    const targetCount = layoutParams.particleCount || 100;
    if (this._authoredCount !== targetCount) {
      this.init(targetCount, this.canvasW, this.canvasH, activeAssets, palette, seed);
    }
    if (!this._noise) this._noise = createNoise(seed || 444);
    const noise = this._noise;
    const {
      noiseFreq = 0.005, noiseSpeed = 0.5, swarmCohesion = 1.5,
      gravityWells = 1.0, damping = 0.95, scale = [0.4, 1.6], alpha = [40, 100],
      wind = 1, body = 3, tight = 0.55,
      // #167 — organism contacts. radius 0 disables the pass entirely.
      contactRadius = 0, contactRestitution = 0.5, contactRepel = 0,
      contactMode = 'none', collideMask = 0xffffffff, maxParticles,
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
    const ALIVE = this.alive;

    for (let i = 0; i < numParticles; i++) {
      // Dead slots integrate nothing and their forces are never consumed
      // (integration skips them; _breed zeroes ax/ay on recycle) — skip the
      // noise3D pair entirely. Behaviour-identical, saves ~2 noise calls
      // per dead particle per frame.
      if (!ALIVE[i]) continue;
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

    // #167 — contact pass. Between forces and integration so impulses flow
    // through the same damping, speed clamp, and wall handling. Skipped
    // entirely when contactRadius is 0: the swarm is then bit-identical to
    // the pre-contact engine (behaviour lock).
    if (contactRadius > 0 && this.n > 1) {
      this._contactPass({
        radius: contactRadius,
        restitution: Math.max(0, Math.min(1, contactRestitution)),
        repel: Math.max(0, contactRepel),
        mode: CONTACT_MODES.includes(contactMode) ? contactMode : 'none',
        umask: collideMask >>> 0,
        // #167 — breed grows the population only under the quality cap.
        // Callers thread it in (useSwarmTick: caps.maxParticles; studio
        // bake: caps.maxParticles); without it breed only recycles dead
        // slots and never grows n.
        breedCap: Number.isFinite(maxParticles) ? maxParticles : this.n,
        seed: seed >>> 0,
        organism,
        minScale, maxScale, minAlpha, maxAlpha,
      });
    }

    const pad = 120;
    const bodyLen = Math.max(1, Math.min(7, Math.round(body || 1)));
    const follow = Math.max(0.05, Math.min(0.95, tight));

    for (let i = 0; i < numParticles; i++) {
      // #167 — dead particles (die) hold no state and integrate nothing.
      if (!this.alive[i]) continue;
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
      // #167 — dead particles (die) render nothing.
      const items = [];
      for (let i = 0; i < this.n; i++) {
        if (!this.alive[i]) continue;
        items.push({
          x: this.x[i], y: this.y[i], scale: this.scale[i],
          rotation: this.rotation[i], alpha: this.alpha[i],
          asset: activeAssets[this.assetIndex[i] % activeAssets.length],
          color: this.color[i], u: this.u[i],
        });
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
      if (!this.alive[i]) continue; // #167 — dead particles render nothing.
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
