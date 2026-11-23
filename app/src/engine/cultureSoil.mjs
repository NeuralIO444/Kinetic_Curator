// cultureSoil.mjs — CULTURE Phase 4: the soil — Life as the world's ground
// (spec §5.2; the parent issue 2152's law). Pure: no DOM, no GL, no clock. The
// world (engine/cultureWorld.mjs) feeds it steps and hands it the culture's
// published field; it never reads time, files, or globals beyond its arguments.
//
// LIFE IS THE SOIL — spec §5.2, Matt's ruling (2026-11-22): "The CULTURE dish
// grows in the #2152 Life layer: living ground feeds the ecology — fertility,
// decay, and creature fortune read it — and dead ground kills, exactly as the
// #2152 ruling already provides. The Life layer is not a separate system running
// beneath a different world; it is this world's ground." The ground IS the
// Phase 1 K2 culture (world.life), read only through its published field
// (cultureLifeField — { cols, rows, gen, level, activity }): this module never
// reaches into the culture's working grids, never writes the culture, and never
// steps it. The soil is a reading of Life plus one law on bodies; it is not a
// second automaton.
//
// LIFE IS NEVER DRAWN — the parent issue's mechanism ruling (2026-11-12): "the
// culture keeps computing underneath … but it stops rendering … What reaches the
// stage is only its effect." This module renders nothing, publishes nothing to
// draw, and imports nothing from the GL or render layers. Everything it hands
// out is a number a later system's law reads.
//
// THE GROUND — a point in body space (stage pixels over the 1920×1080 dish,
// exactly 20 px per shared-grid cell) stands on ONE cell of the shared grid: the
// cell under it, floor(x / cellW), floor(y / cellH). The cell's level is the
// culture's own published level: 1 where the cell is alive, easing to 0 through
// the decay states, exactly 0 where it is dead. LIVING GROUND is level > 0 — an
// alive or still-decaying cell (a rotting colony still has life in it); DEAD
// GROUND is level 0, the automaton's dead state. Beyond the grid is dead ground:
// the culture core's own RIM law (dishLife.mjs: "cells beyond the grid are
// dead") — a body out in the swarm's wrap pad stands on no soil.
//
// THE READINGS — the read door Phase 5/6 citizens call (cultureSoilSample here,
// cultureSoilAt on the world), all from the published field:
//   living     the ground under the point lives (level > 0).
//   level      the cell's published level (0..1).
//   fertility  how much the living ground around the point feeds: the mean level
//              over the cell's 3×3 Moore neighbourhood — Life's own neighbourhood
//              — beyond-grid cells counting dead, over all nine (0..1). Living
//              ground feeds; a lone living cell in dead ground feeds little.
//   decay      how far the ground under the point has rotted: 1 − level — 0 on
//              an alive cell, rising through the decay states, 1 on dead ground.
//   fortune    what the ground deals a creature standing here, signed: the
//              fertility on living ground (> 0), −1 on dead ground (mortal —
//              the #2152 kill). The one reading that carries the law's sign.
// These are readings, not laws: no feeding, fat, starvation, predation, corpse
// decay, or breeding reads them yet — those are Phase 6's, on living citizens.
//
// DEAD GROUND KILLS — the parent issue's ruling (Matt, 2026-11-12): "Something
// standing on dead ground too long withers and is gone; populations genuinely
// die out in the dead zones." The build-time default (culture-phasing.md):
// "wither over 4 s standing on dead ground". Each living body carries a wither
// clock in world steps. On every world step (the 120 Hz clock — the soil step
// runs on every step, after everything that moves bodies or grows the culture),
// a living body whose centre stands on dead ground ages its clock by one; a body
// on living ground has its clock restarted at 0 — the withering is for standing
// on dead ground SUSTAINED, the phasing table's reading (its starvation line
// reads the same way: "sustained 5 s"). The step the clock reaches the wither
// span (CULTURE_SOIL_WITHER_S × the world's step rate = 480 steps) the body is
// gone: its alive flag drops to 0, which every other system already reads (the
// swarm neither moves nor counts it, the contact dealer and the solver skip it,
// the fields and the hand push nothing into it), and its clock clears — a dead
// body has no clock. The kill is the soil's only write: it never moves a body,
// never touches a velocity, and never resurrects one. What a corpse does next
// (persisting, decaying, being looted) is Phase 6's.
//
// THE READ DISCIPLINE — the soil reads the published field as it stands when
// the soil step runs: the culture's LAST COMPLETED generation. Inside a world
// step the soil runs after the life branch, so at a step where a generation
// completes, the soil reads that completed generation — never a working buffer,
// never a generation still to come. The soil's verdict lands on the body table
// at the end of the step, so every mover reads it one step behind: a body the
// ground killed at step s is first absent from the swarm, the solver, and the
// forces at step s + 1. The read door reads the same published face, so a
// citizen asking between steps sees exactly the ground the wither law judged.
//
// LAW — the soil is resolver-class, like the fields, the hand, and the solver:
// CPU JS by the Full WebGL program's standing law, a pure function of world
// state, js-exact, and it stamps nothing of its own. The world's law
// composition is unchanged by this phase. Its state (step, the kill count, the
// living bodies' clocks) is world state, and the world hash folds it in whole.
import { CULTURE_SWARM_WORLD_W, CULTURE_SWARM_WORLD_H } from './cultureSwarm.mjs';

/** The dead-ground kill: seconds of sustained standing on dead ground that wither a body (phasing defaults table). */
export const CULTURE_SOIL_WITHER_S = 4;

/**
 * The soil's state, sized to the body table's capacity: the step count, how
 * many bodies the ground has killed, and one wither clock per body slot (world
 * steps stood on dead ground, sustained; 0 for a dead body).
 */
export function createCultureSoil(capacity) {
  return {
    /** Soil steps run: one per world step, always (the soil judges on the world's own clock). */
    step: 0,
    /** Bodies the dead ground has killed since birth. */
    killed: 0,
    /** Per body slot: consecutive world steps its centre has stood on dead ground. */
    wither: new Uint32Array(capacity),
  };
}

/**
 * The cell a body-space point stands on, as a flat index into the field, or −1
 * beyond the grid (dead ground — the rim law). A non-finite coordinate stands on
 * no cell. Pure.
 */
export function cultureSoilCell(field, x, y) {
  const cx = Math.floor(x / (CULTURE_SWARM_WORLD_W / field.cols));
  const cy = Math.floor(y / (CULTURE_SWARM_WORLD_H / field.rows));
  if (!(cx >= 0 && cx < field.cols && cy >= 0 && cy < field.rows)) return -1;
  return cy * field.cols + cx;
}

/** Does the ground under a body-space point live? Dead ground — level 0, or beyond the grid — does not. Pure. */
export function cultureSoilLiving(field, x, y) {
  const i = cultureSoilCell(field, x, y);
  return i >= 0 && field.level[i] > 0;
}

/**
 * The soil reading at a body-space point, from the published field: { gen,
 * cell, living, level, fertility, decay, fortune } (see THE READINGS above). A
 * fresh object per call; it holds no reference to the field's arrays. Pure.
 */
export function cultureSoilSample(field, x, y) {
  const { cols, rows, level } = field;
  const cell = cultureSoilCell(field, x, y);
  const lv = cell >= 0 ? level[cell] : 0;
  const living = lv > 0;
  let fertility = 0;
  if (cell >= 0) {
    const cx = cell % cols;
    const cy = (cell - cx) / cols;
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = cy + dy;
      if (yy < 0 || yy >= rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx;
        if (xx < 0 || xx >= cols) continue;
        sum += level[yy * cols + xx];
      }
    }
    fertility = sum / 9;
  }
  return {
    gen: field.gen,
    cell,
    living,
    level: lv,
    fertility,
    decay: 1 - lv,
    fortune: living ? fertility : -1,
  };
}

/**
 * One soil step over a body table — the dead-ground kill. Every living body,
 * ascending by index (canonical order): on dead ground its clock ages one step
 * and, on reaching `witherSteps`, the body is gone (alive 0, clock cleared, the
 * kill counted); on living ground its clock restarts at 0. Dead bodies are
 * skipped (their clocks stand at 0). Writes nothing but the alive flags and the
 * soil's own state; reads the field and never writes it. Advances soil.step by
 * one (the step counts over an empty table too — the law ran). Pure function of
 * its arguments.
 */
export function stepCultureSoil(bodies, soil, field, witherSteps) {
  const { count, alive, x, y } = bodies;
  const wither = soil.wither;
  for (let i = 0; i < count; i++) {
    if (!alive[i]) continue;
    if (cultureSoilLiving(field, x[i], y[i])) {
      wither[i] = 0;
      continue;
    }
    wither[i] += 1;
    if (wither[i] >= witherSteps) {
      alive[i] = 0;
      wither[i] = 0;
      soil.killed += 1;
    }
  }
  soil.step += 1;
  return bodies;
}

/**
 * A canonical hash of the soil's standing state: the step count, the kill
 * count, the dealt-prefix length, and each dealt body's wither clock. Same
 * state => same hash, on any device. FNV-1a, the cultureHandHash discipline —
 * the world hash folds this in whole.
 */
export function cultureSoilHash(soil, count) {
  let h = 0x811c9dc5;
  const mix = (byte) => {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const mixU32 = (v) => {
    mix(v & 255);
    mix((v >>> 8) & 255);
    mix((v >>> 16) & 255);
    mix((v >>> 24) & 255);
  };
  mixU32(soil.step);
  mixU32(soil.killed);
  mixU32(count);
  for (let i = 0; i < count; i++) mixU32(soil.wither[i]);
  return h >>> 0;
}
