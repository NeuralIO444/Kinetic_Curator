/**
 * renderFault.mjs — #266: deterministic render-fault tracking for the live loop.
 *
 * The honest-readout creed applied to the loop itself. Any deterministic
 * per-frame exception (frame building / rendering / presenting) used to be
 * swallowed by the tick's try/catch, so the canvas froze on the last frame
 * while the app looked alive — zero UI signal. This module tracks whether
 * the failures are *deterministic* (consecutive) rather than a transient
 * single-frame blip, and flags a sticky RENDER FAULT state:
 *
 * - RENDER_FAULT_FAILS consecutive failed ticks -> fault trips (notify(true))
 * - while the fault is active, RENDER_FAULT_RECOVERY consecutive clean
 *   presents are required before it clears (notify(false)) — one good frame
 *   after a deterministic fault does not clear it
 * - neutral ticks (bake in flight, paused) don't touch either counter
 *
 * The tracker is pure: the live loop owns the notify callback (it writes
 * the store flag) and the actual tick wiring. notify fires ONLY on
 * transitions, never per frame.
 */

export const RENDER_FAULT_FAILS = 3;
export const RENDER_FAULT_RECOVERY = 60;

/** One-line diagnosis label for the pill tooltip. */
export function frameFaultReason(e) {
  return `frame fault: ${shortErr(e)}`;
}

/** One-line diagnosis label for the pill tooltip. */
export function bakeFaultReason(e) {
  return `atlas bake failing: ${shortErr(e)}`;
}

function shortErr(e) {
  const msg = e && e.message ? String(e.message) : String(e);
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}

export function createRenderFaultTracker(notify) {
  if (typeof notify !== 'function') throw new Error('[renderFault] notify required');
  let consecFails = 0;
  let consecClean = 0;
  let active = false;

  return {
    /** A tick threw. Neutral ticks (bake in flight / paused) don't call this. */
    noteFrameFailure(reason) {
      consecClean = 0;
      consecFails += 1;
      if (consecFails >= RENDER_FAULT_FAILS && !active) {
        active = true;
        notify(true, reason);
      }
    },
    /**
     * An external deterministic fault (atlas bake). The caller applies its
     * own consecutive-failure threshold (shared with the backoff logic),
     * because bake failures never throw into the tick — the frame just
     * holds while the bake retries.
     */
    noteExternalFault(reason) {
      if (!active) {
        active = true;
        notify(true, reason);
      }
    },
    /** A tick presented cleanly. */
    noteCleanPresent() {
      consecFails = 0;
      if (active) {
        consecClean += 1;
        if (consecClean >= RENDER_FAULT_RECOVERY) {
          active = false;
          consecFails = 0;
          consecClean = 0;
          notify(false, null);
        }
      }
    },
    isActive: () => active,
  };
}
