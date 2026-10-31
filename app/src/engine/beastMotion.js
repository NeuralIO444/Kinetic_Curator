// app/src/engine/beastMotion.js — #1867 BEAST S4: the travelling home.
//
// Body speed = backward speed of the lowest stance foot. Steering = left/right crank-rate difference (tank-style).
// Decide once per crank cycle, quantize to fixed steps, log for replay.
// Davis sets rate and heading-hold duration. Queen lean biases heading choice (logged, not persisted).
// Push collisions by mass = scale × legCount; lighter slips. Rim bounce or reverse by mass + dish dynamics.
// Pin is home anchor for save/replay only.

import { solvePose } from './jansenSolver.js';

export function bodySpeedFromStance(measures, theta, scale) {
  const pose = solvePose(measures, theta, scale);
  if (!pose) return 0;
  // Simplified: stance foot velocity magnitude as body advance (full calc in follow-up)
  return 0.4 * scale; // placeholder matching published step order
}

export function steerCrankRates(headingError, maxDiff = 0.3) {
  // Pure controller: map heading error to quantized crank-rate difference
  const steps = 8;
  const raw = Math.max(-1, Math.min(1, headingError)) * maxDiff;
  return Math.round(raw * steps) / steps;
}

/** Mass-based push: lighter body is shoved more; stance feet slip visibly (slip factor). */
export function pushCollision(stateA, massA, stateB, massB, slip = 0.3) {
  const dx = stateB.x - stateA.x;
  const dy = stateB.y - stateA.y;
  const dist = Math.hypot(dx, dy) || 1;
  const total = massA + massB;
  const pushA = (massB / total) * 0.05;
  const pushB = (massA / total) * 0.05;
  stateA.x -= (dx / dist) * pushA;
  stateA.y -= (dy / dist) * pushA;
  stateB.x += (dx / dist) * pushB;
  stateB.y += (dy / dist) * pushB;
  // Lighter slips more
  if (massA < massB) stateA.slip = slip;
  else stateB.slip = slip;
  return { stateA, stateB };
}

export function stepBeast(state, measures, drives, queenBias, dt, dishRadius, log = []) {
  // state: { x, y, heading, thetaL, thetaR, rate, cycle }
  state.cycle = (state.cycle || 0) + 1;
  const headingError = (drives.targetHeading || 0) - state.heading + (queenBias || 0);
  const diff = steerCrankRates(headingError);
  // Log once per crank cycle (approx every 60 frames at 1 rad/s)
  if (state.cycle % 60 === 0) {
    log.push({ cycle: state.cycle, diff, bias: queenBias, heading: state.heading });
  }
  state.thetaL = (state.thetaL + (state.rate + diff) * dt) % (Math.PI * 2);
  state.thetaR = (state.thetaR + (state.rate - diff) * dt) % (Math.PI * 2);
  const speed = bodySpeedFromStance(measures, state.thetaL, measures.scale || 1);
  state.x += Math.cos(state.heading) * speed * dt;
  state.y += Math.sin(state.heading) * speed * dt;
  // Rim: bounce or reverse
  const r = Math.hypot(state.x, state.y);
  if (r > dishRadius) {
    const mass = (measures.scale || 1) * (measures.legCount || 12);
    if (mass > 8)
      state.heading += Math.PI; // reverse
    else {
      state.x *= dishRadius / r;
      state.y *= dishRadius / r;
    } // bounce
  }
  return state;
}
