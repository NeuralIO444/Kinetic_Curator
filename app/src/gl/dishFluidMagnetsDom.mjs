// dishFluidMagnetsDom.mjs — FERROFLUID (#1997): the stage gesture that places the magnets.
//
// Magnets are placed objects that stay on the dish — NOT the hand, not a brush. This module is
// the performer's hand while the chip's MAGNETS arm is on (store: dishFluidMagnetArm):
//   press empty dish   → place a magnet there (up to the kernel's MAX_MAGNETS) and hold it
//   press a magnet     → pick it up; drag moves it; release sets it down
//   alt-press a magnet → lift it off the dish
// Every act goes through the store's magnet actions, so the magnets ride the frame beside the
// fluid stamp and the take records them exactly, like the dish's other state. While the arm is
// off — or the press lands anywhere but the canvas — this module does nothing at all: the
// canvas keeps its standing gestures (the dish-life touch notes still fire; only the stage's
// own press consumers are pre-empted, by stopPropagation on the capture pass, never
// stopImmediatePropagation).
//
// Coordinates: the fluid floor fills the canvas exactly (a fullscreen quad beneath the
// strata), so dish space IS canvas space — the magnet at dish (x, y) stands at that fraction
// of the canvas, y down, the same point the stamp's culture grid uses. Zoom/pan of the stage
// view do not apply to the dish floor and so do not apply here either.

import { MAX_MAGNETS, MAGNET_RADIUS } from '../engine/dishFluid.mjs';

/** How close (dish units, aspect-corrected) a press must land to take hold of a magnet. */
export const MAGNET_HIT = MAGNET_RADIUS * 0.6;

/** The aspect-corrected distance between two dish points (dy scaled by aspectHW). Pure. */
export function magnetDistance(a, b, aspectHW) {
  const dx = a.x - b.x;
  const dy = (a.y - b.y) * aspectHW;
  return Math.hypot(dx, dy);
}

/** The index of the magnet a press takes hold of, or -1 (nearest within MAGNET_HIT). Pure. */
export function magnetHitIndex(magnets, p, aspectHW) {
  let best = -1;
  let bestD = MAGNET_HIT;
  for (let i = 0; i < (magnets || []).length; i++) {
    const d = magnetDistance(magnets[i], p, aspectHW);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Install the gesture on the canvas. `getState` is the loop's store read (the zustand state,
 * actions included). Returns the disposer. A canvas without listener support installs nothing.
 */
export function installDishFluidMagnets(canvas, getState) {
  if (!canvas || typeof canvas.addEventListener !== 'function' || typeof getState !== 'function') return () => {};
  const win = typeof window !== 'undefined' ? window : null;
  let dragIndex = -1;

  const dishPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    if (!r || !(r.width > 0) || !(r.height > 0)) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      aspectHW: r.height / r.width,
    };
  };

  const onDown = (e) => {
    const s = getState();
    if (!s || !s.dishFluidMagnetArm || !s.dishFluid) return;
    if (e.target !== canvas) return;
    const p = dishPoint(e);
    if (!p) return;
    const magnets = s.dishFluidMagnets || [];
    const hit = magnetHitIndex(magnets, p, p.aspectHW);
    if (e.altKey) {
      if (hit >= 0) {
        s.removeDishFluidMagnet(hit);
        e.stopPropagation();
        e.preventDefault();
      }
      return;
    }
    if (hit >= 0) {
      dragIndex = hit;
    } else if (magnets.length < MAX_MAGNETS) {
      s.placeDishFluidMagnet(p.x, p.y);
      dragIndex = (getState().dishFluidMagnets || []).length - 1;
    } else {
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    if (win) {
      win.addEventListener('pointermove', onMove, true);
      win.addEventListener('pointerup', onUp, true);
    }
  };
  const onMove = (e) => {
    if (dragIndex < 0) return;
    const p = dishPoint(e);
    if (p) getState().moveDishFluidMagnet(dragIndex, p.x, p.y);
  };
  const onUp = () => {
    dragIndex = -1;
    if (win) {
      win.removeEventListener('pointermove', onMove, true);
      win.removeEventListener('pointerup', onUp, true);
    }
  };

  canvas.addEventListener('pointerdown', onDown, true);
  return () => {
    canvas.removeEventListener('pointerdown', onDown, true);
    onUp();
  };
}
