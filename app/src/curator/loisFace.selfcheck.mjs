import assert from 'node:assert';
import {
  LOIS_FACES,
  LOIS_LEAN_HOLD_MS,
  LOIS_NOD_FLASH_MS,
  resolveLoisFace,
  createLoisFaceSession,
} from './loisFace.js';

const T = 1_000_000;

// Base state: AWAY, never latched.
assert.strictEqual(resolveLoisFace({ now: T }).code, 'AWAY');
assert.strictEqual(resolveLoisFace({ now: T, liftAt: T - LOIS_LEAN_HOLD_MS - 1 }).code, 'AWAY');

// LEAN: a fresh lift, holds ~12s.
assert.strictEqual(resolveLoisFace({ now: T, liftAt: T }).code, 'LEAN');
assert.strictEqual(resolveLoisFace({ now: T, liftAt: T - (LOIS_LEAN_HOLD_MS - 1) }).code, 'LEAN');
assert.strictEqual(resolveLoisFace({ now: T, liftAt: T - LOIS_LEAN_HOLD_MS }).code, 'AWAY');

// NOD: transient flash, then falls back to the mode-driven state.
assert.strictEqual(resolveLoisFace({ now: T, keptAt: T }).code, 'NOD');
assert.strictEqual(resolveLoisFace({ now: T, keptAt: T - (LOIS_NOD_FLASH_MS - 1) }).code, 'NOD');
assert.strictEqual(resolveLoisFace({ now: T, keptAt: T - LOIS_NOD_FLASH_MS }).code, 'AWAY');
assert.strictEqual(
  resolveLoisFace({ now: T, keptAt: T - LOIS_NOD_FLASH_MS, liftAt: T - LOIS_NOD_FLASH_MS }).code,
  'LEAN',
);

// VIBE: dwell AND idle — lingering without acting. Acting kills it.
assert.strictEqual(resolveLoisFace({ now: T, dwellMs: 8000, idleMs: 8000 }).code, 'VIBE');
assert.strictEqual(resolveLoisFace({ now: T, dwellMs: 8000, idleMs: 0 }).code, 'AWAY');
assert.strictEqual(resolveLoisFace({ now: T, dwellMs: 7999, idleMs: 99999 }).code, 'AWAY');
assert.strictEqual(resolveLoisFace({ now: T, dwellMs: 99999, idleMs: 7999 }).code, 'AWAY');
assert.strictEqual(resolveLoisFace({ now: T, seedRevisit: true, idleMs: 8000 }).code, 'VIBE');
assert.strictEqual(resolveLoisFace({ now: T, seedRevisit: true, idleMs: 0 }).code, 'AWAY');

// Priority: NOD > VIBE > LEAN > AWAY.
assert.strictEqual(
  resolveLoisFace({ now: T, keptAt: T, dwellMs: 99999, idleMs: 99999, liftAt: T }).code,
  'NOD',
);
assert.strictEqual(
  resolveLoisFace({ now: T, dwellMs: 99999, idleMs: 99999, liftAt: T }).code,
  'VIBE',
);

// Faces, labels, and the parked red: pure Unicode, no CRIT, Heller NOD line.
assert.strictEqual(LOIS_FACES.AWAY.face, '(・_・)');
assert.strictEqual(LOIS_FACES.LEAN.face, '(￣ー￣)');
assert.strictEqual(LOIS_FACES.VIBE.face, '(￣▽￣)');
assert.strictEqual(LOIS_FACES.NOD.face, '(¬‿¬)');
assert.strictEqual(LOIS_FACES.NOD.label, 'now you are thinking with your own brains');
assert.ok(!LOIS_FACES.CRIT);

// Session: nothing latches. Lift, fall back; keep, flash, fall back.
{
  let t = T;
  const s = createLoisFaceSession({ now: () => t });
  assert.strictEqual(s.face({ now: t }).code, 'AWAY');
  s.noteCurate();
  assert.strictEqual(s.face({ now: t }).code, 'LEAN');
  t += LOIS_LEAN_HOLD_MS + 1;
  assert.strictEqual(s.face({ now: t }).code, 'AWAY'); // AWAY comes back
  s.noteBrowse();
  assert.strictEqual(s.face({ now: t }).code, 'LEAN');
  s.noteKeep();
  assert.strictEqual(s.face({ now: t }).code, 'NOD');
  t += LOIS_NOD_FLASH_MS + 1;
  assert.strictEqual(s.face({ now: t }).code, 'LEAN'); // flash falls back to the fresh lift
  t += LOIS_LEAN_HOLD_MS + 1;
  assert.strictEqual(s.face({ now: t }).code, 'AWAY');
  // VIBE through the honest feed: dwell + idle, never dwell alone.
  t += 100000;
  assert.strictEqual(s.face({ now: t, dwellMs: 20000, idleMs: 20000 }).code, 'VIBE');
  assert.strictEqual(s.face({ now: t, dwellMs: 20000, idleMs: 100 }).code, 'AWAY');
}

console.log('loisFace.selfcheck: ok');
