/**
 * paletteMix.mjs — VJ MIX palette crossfade state machine (#278).
 *
 * Why a frame crossfade instead of blending palette tokens: instance tints
 * are baked into the atlas texture (one SVG rasterization per
 * asset|tint|accent combo), so per-frame token blending would need a full
 * atlas rebake every frame — the loop would hold frames for the whole mix.
 * The smooth-by-construction primitive is therefore two-deck: the outgoing
 * palette's last rendered frame is snapshotted into a persistent GPU target,
 * the incoming palette renders live, and the existing composite shader
 * dissolves between them over the MIX duration. Per-frame cost during a
 * mix is one fullscreen composite pass plus the normal render — no
 * per-frame allocations, no rebake churn, and the mixed frame feeds the
 * ACCUM feedback path exactly like any other frame.
 *
 * Pure logic, no GL: the live loop (liveLoop.mjs) owns the GPU targets and
 * drives this machine once per buildFrame(). Unit-tested in
 * paletteMix.selfcheck.mjs.
 */

export const MIX_MIN = 0;
export const MIX_MAX = 8;
export const MIX_DEFAULT = 2;

/** Clamp a MIX slider value to the 0–8s range; non-numeric falls back to default. */
export function sanitizeMixSeconds(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return MIX_DEFAULT;
  return Math.min(MIX_MAX, Math.max(MIX_MIN, n));
}

/**
 * Smootherstep easing for the dissolve: eases in and out so the crossfade
 * never reads as a mechanical linear wipe.
 */
export function mixEase(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Create the crossfade state machine.
 *
 * Palette identity is compared by REFERENCE (paletteId, paletteOverrides,
 * userPalettes) — the store replaces those references on every edit rather
 * than mutating them, so identity is exact and costs nothing per frame.
 *
 * update() returns one of:
 * - { kind: 'none' }              — palette unchanged, no dissolve running
 * - { kind: 'cut' }               — change with MIX=0, or no previous frame:
 *                                  hard cut, render normally
 * - { kind: 'start', dur, retarget } — begin (or retarget) a dissolve. The
 *                                  caller snapshots the outgoing frame into
 *                                  the hold target unless retarget is true
 *                                  (a rapid successive switch re-uses the
 *                                  original held frame and just retargets
 *                                  the incoming palette — the DJ re-base, so
 *                                  the blend always converges and allocations
 *                                  never stack).
 * - { kind: 'arming' }            — dissolve armed, waiting for the incoming
 *                                  palette's atlas bake (bakeReady=false)
 * - { kind: 'mix', t }            — dissolve running, t eased in [0,1)
 * - { kind: 'done' }              — dissolve completed; caller renders the
 *                                  pure incoming frame from here on
 */
export function createPaletteMix() {
  let seen = null; // { id, overrides, user } — identity of the last update
  let dissolve = null; // null | { start: -1 (arming) | ms timestamp, dur }

  function update({
    id, overrides, userPalettes, mode, behave, assetsKey,
    mixSeconds, now, canDissolve, bakeReady, scrubT,
  }) {
    const changed = !seen
      || id !== seen.id
      || overrides !== seen.overrides
      || userPalettes !== seen.user
      || mode !== seen.mode
      || behave !== seen.behave
      || assetsKey !== seen.assetsKey;
    if (changed) {
      const retarget = dissolve !== null;
      seen = { id, overrides, user: userPalettes, mode, behave, assetsKey };
      const dur = sanitizeMixSeconds(mixSeconds);
      if (!canDissolve || (dur <= 0 && scrubT == null)) {
        dissolve = null;
        return { kind: 'cut', retarget: false };
      }
      dissolve = { start: -1, dur };
      return { kind: 'start', dur, retarget };
    }
    if (dissolve) {
      if (dissolve.start < 0) {
        // The incoming palette/mode combos are still baking — the loop
        // holds frames meanwhile, so the dissolve must not start early.
        if (!bakeReady) return { kind: 'arming' };
        dissolve.start = now;
        return { kind: 'mix', t: scrubT != null ? mixEase(scrubT) : 0 };
      }
      if (scrubT != null) {
        if (scrubT >= 1) {
          dissolve = null;
          return { kind: 'done' };
        }
        return { kind: 'mix', t: mixEase(scrubT) };
      }
      const t = (now - dissolve.start) / (dissolve.dur * 1000);
      if (t >= 1) {
        dissolve = null;
        return { kind: 'done' };
      }
      return { kind: 'mix', t: mixEase(t) };
    }
    return { kind: 'none' };
  }

  /** True while a dissolve is armed or running. */
  function isDissolving() {
    return dissolve !== null;
  }

  /**
   * Abandon any dissolve (context loss, dispose, snapshot failure). The
   * next update() treats the palette as freshly seen — a hard cut, never a
   * composite against a dead target.
   */
  function cancel() {
    dissolve = null;
  }

  /**
   * Silently adopt {id, overrides, mode, behave, assetsKey} as "already
   * seen", with no cut and no dissolve. For a caller-known non-visual
   * identity swap — e.g. the live loop's active-layer editing focus
   * changing, which swaps which layer's config populates these same top-
   * level fields without changing anything actually on screen (the layer
   * being left renders on from its own snapshot with the same values; the
   * layer becoming active already had these values). Without this, the
   * next update() sees id/mode/behave change and fires a cut or dissolve
   * for a frame that never visually changed.
   */
  function resync({ id, overrides, userPalettes, mode, behave, assetsKey }) {
    seen = { id, overrides, user: userPalettes, mode, behave, assetsKey };
    dissolve = null;
  }

  return { update, isDissolving, cancel, resync };
}
