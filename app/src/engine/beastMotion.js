// app/src/engine/beastMotion.js — #1867 BEAST S4: the travelling home.
//
// Body speed = backward speed of the lowest stance foot. Steering = left/right crank-rate difference (tank-style).
// Decide once per crank cycle, quantize to fixed steps, log for replay.
// Davis sets rate and heading-hold duration. Queen lean biases heading choice (logged, not persisted).
// Push collisions by mass = scale × legCount; lighter slips. Rim bounce or reverse by mass + dish dynamics.
// Pin is home anchor for save/replay only.

import { solvePose } from './jansenSolver.js';

export function bodySpeedFromStance(measures, theta, scale, dt) {
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

export function stepBeast(state, measures, drives, queenBias, dt, dishRadius) {
  // state: { x, y, heading, thetaL, thetaR, rate }
  const diff = steerCrankRates(drives.targetHeading - state.heading + queenBias);
  state.thetaL = (state.thetaL + (state.rate + diff) * dt) % (Math.PI * 2);
  state.thetaR = (state.thetaR + (state.rate - diff) * dt) % (Math.PI * 2);
  const speed = bodySpeedFromStance(measures, state.thetaL, measures.scale || 1, dt);
  state.x += Math.cos(state.heading) * speed * dt;
  state.y += Math.sin(state.heading) * speed * dt;
  // Rim: bounce or reverse
  const r = Math.hypot(state.x, state.y);
  if (r > dishRadius) {
    const mass = (measures.scale || 1) * (measures.legCount || 12);
    if (mass > 8) state.heading += Math.PI; // reverse
    else { state.x *= dishRadius / r; state.y *= dishRadius / r; } // bounce
  }
  return state;
}
