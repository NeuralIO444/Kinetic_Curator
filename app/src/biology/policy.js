// biology/policy.js — #793: the versioned lifecycle policy for living forms.
//
// Biology answers "how does it live and die?" (aging, when old growth fades,
// when regrowth triggers, population caps); the curator engine (#762) answers
// "what's worth keeping?". Until the curator exists, this module is the real
// home of lifecycle policy — not a stopgap.
//
// Follows the taste vector pattern (curator/tasteHead.js + tasteStore.js):
// a kind/version envelope, a strict validator (import is a trust boundary),
// and a module holder persisted to localStorage so tuning survives reloads.
// The policy is pure data — the decisions live in lifecycle.js, the hooks
// they drive live in engine/kernel/sample/growth.js (GrowthHooks).
//
// Supersedes the #829 stub (src/data/biology.js, removed in this PR): it was
// never wired to any sampler, predated the #833 hook interface, and its
// dt-based population model doesn't fit the tick-based aggregate lifecycle.
// This module is the single 'kc-biology' v1 identity.

export const BIO_KIND = 'kc-biology';
export const BIO_VERSION = 1;
export const BIO_KEY = 'kc:biology:v1';

/**
 * The shipped tuning. Every field is a policy knob, not a physical bound:
 * the 2048-cell FIFO in growth.js is the hard backstop; these decide the
 * expressive lifecycle well before it — a form should read as alive, age,
 * fade, and be reborn, never sit saturated.
 */
export function defaultBiologyPolicy() {
  return {
    kind: BIO_KIND,
    version: BIO_VERSION,
    growth: {
      // Fade schedule over age01 (0 newborn → 1 fully aged, 480 ticks).
      fadeStart: 0.35, // age01 where fading begins — young growth stays fully present
      fadeEnd: 1.0, // age01 where fully faded — old growth dissolves, never pops
      // Population: the policy acts before the 2048-cell hard cap.
      softCap: 1400, // cells — regrow triggers here so the form stays readable
      // Lifespan: natural-death triggers.
      maxLifespan: 1500, // ticks — oldest-cell age that ends a generation (~25s at 60fps)
      regrowMeanAge: 0.75, // mean age01 that ends a generation — the form is mostly old
      // Safety rail: no generation is reborn more often than this, whatever
      // the tuning. Prevents degenerate retune loops (e.g. a tiny softCap
      // retriggering on the 64-cell zygote bloom every frame).
      minLifetime: 300, // ticks (~5s at 60fps)
    },
  };
}

const finite = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * Validate an imported biology policy (a trust boundary: it comes from a
 * file or storage). Returns { ok: true, policy } with a normalized copy, or
 * { ok: false, error }. Unknown extra fields are dropped, not rejected —
 * forward-compat for future policy versions' new knobs.
 */
export function validateBiologyPolicy(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'not a biology policy file' };
  }
  if (raw.kind !== BIO_KIND) return { ok: false, error: 'not a biology policy file (kind)' };
  if (raw.version !== BIO_VERSION) {
    return { ok: false, error: `biology policy v${raw.version} — this app reads v${BIO_VERSION}` };
  }
  const g = raw.growth;
  if (!g || typeof g !== 'object') return { ok: false, error: 'biology policy has no growth section' };
  const num = (v, lo, hi, name) => {
    if (!finite(v) || v < lo || v > hi) return { ok: false, error: `bad growth.${name}: ${v}` };
    return null;
  };
  for (const [v, lo, hi, name] of [
    [g.fadeStart, 0, 1, 'fadeStart'],
    [g.fadeEnd, 0, 1, 'fadeEnd'],
    [g.softCap, 64, 2048, 'softCap'],
    [g.maxLifespan, 60, 100000, 'maxLifespan'],
    [g.regrowMeanAge, 0, 1, 'regrowMeanAge'],
    [g.minLifetime, 0, 100000, 'minLifetime'],
  ]) {
    const err = num(v, lo, hi, name);
    if (err) return err;
  }
  if (g.fadeEnd <= g.fadeStart) return { ok: false, error: 'growth.fadeEnd must exceed growth.fadeStart' };
  return {
    ok: true,
    policy: {
      kind: BIO_KIND,
      version: BIO_VERSION,
      growth: {
        fadeStart: g.fadeStart,
        fadeEnd: g.fadeEnd,
        softCap: Math.floor(g.softCap),
        maxLifespan: Math.floor(g.maxLifespan),
        regrowMeanAge: g.regrowMeanAge,
        minLifetime: Math.floor(g.minLifetime),
      },
    },
  };
}

// ── Module holder + persistence (tasteStore.js pattern) ────────────────────

function read() {
  try {
    const raw = localStorage.getItem(BIO_KEY);
    if (!raw) return null;
    const r = validateBiologyPolicy(JSON.parse(raw)); // storage is a trust boundary too
    return r.ok ? r.policy : null;
  } catch {
    return null;
  }
}

let current = read() || defaultBiologyPolicy();

/** The active policy — a cheap reference read, safe on the per-frame path. */
export function getBiologyPolicy() {
  return current;
}

/** Validate + adopt a policy object. Returns { ok, error? }. */
export function importBiologyPolicy(raw) {
  const r = validateBiologyPolicy(raw);
  if (!r.ok) return r;
  current = r.policy;
  try {
    localStorage.setItem(BIO_KEY, JSON.stringify(r.policy));
  } catch {
    // private window / quota: the session still lives by it, it just won't be remembered.
  }
  return { ok: true, policy: r.policy };
}

/** Back to the shipped tuning. */
export function resetBiologyPolicy() {
  current = defaultBiologyPolicy();
  try {
    localStorage.setItem(BIO_KEY, JSON.stringify(current));
  } catch {
    // deliberately silent
  }
  return current;
}

/** The policy as an exportable JSON string (versioned, inspectable). */
export function exportBiologyPolicy() {
  return JSON.stringify(current, null, 2);
}
