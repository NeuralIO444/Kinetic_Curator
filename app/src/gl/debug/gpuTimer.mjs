/**
 * Per-effect GPU timing — harness Layer 4 (#193).
 *
 * Wraps EXT_disjoint_timer_query_webgl2 when available; falls back to
 * CPU `performance.now()` otherwise so the API is always usable.
 *
 * Usage:
 *   const t = createGpuTimer(gl);
 *   t.begin('blur'); ...draw...; t.end('blur');
 *   const r = t.poll(); // { done, disjoint, timings: Map<label, ms> }
 *   // poll until r.done — GPU results arrive a few frames late.
 */

// #480 — some GL driver stacks (confirmed on a real Mac Studio, M2 Max,
// Chromium via Playwright) report EXT_disjoint_timer_query_webgl2 as
// present, but its constants are not valid enums on the actual WebGL2
// query entry points: gl.beginQuery(ext.TIME_ELAPSED_EXT, ...) itself
// throws "INVALID_ENUM: enable: invalid capability", and
// gl.getQueryParameter(q, ext.QUERY_RESULT_AVAILABLE_EXT) throws
// "INVALID_ENUM: getQueryParameter: invalid parameter name" on every
// call — confirmed by instrumenting both call sites directly, not
// inferred from timing alone. So the query's result-available flag can
// never legitimately become true; poll() would spin forever, the live
// loop (one begin/end/poll per frame, never cleared on !done) leaks one
// never-deleted WebGL query object every frame, and the GL error queue
// fills with errors this module never drained, which then surface at
// whichever unrelated caller happens to be the next one to check
// gl.getError() (a real symptom hit here: the failure attributed itself
// to a completely different test, tapPoints, purely because that was the
// next checkGlError() call in the suite).
//
// checkAndClearError() runs right after every hardware-path GL call that
// can produce this: catches it at the source (immediately on the first
// begin(), typically) instead of waiting out a stall, and fully drains
// the error state so nothing leaks to the next caller. giveUpOnHardware()
// is the shared response — permanently downgrade this timer instance to
// the CPU-clock fallback so it stops repeating (and leaking) on every
// subsequent frame. POLL_STALL_LIMIT stays as a second, slower net for a
// driver that fails silently (no GL error, the flag just never flips) —
// a different failure shape than the one actually observed here.
const POLL_STALL_LIMIT = 200;

export function createGpuTimer(gl) {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const pending = [];
  let hardwareBroken = false;

  function findOpen(label) {
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].label === label && pending[i].open) return pending[i];
    }
    return null;
  }

  // WebGL's error state is a small set of flags, not an unbounded queue —
  // drain it fully so a driver-quirk error from this timer's own hardware
  // probe never leaks forward into an unrelated caller's next
  // gl.getError() check.
  function checkAndClearError() {
    let sawError = false;
    let guard = 0;
    while (gl.getError() !== gl.NO_ERROR && guard++ < 8) sawError = true;
    return sawError;
  }

  function giveUpOnHardware() {
    hardwareBroken = true;
    for (const p of pending) if (p.query) gl.deleteQuery(p.query);
    pending.length = 0;
    checkAndClearError();
  }

  return {
    /** True when real GPU timestamps are in use (false = CPU fallback). */
    get isHardware() {
      return !!ext && !hardwareBroken;
    },

    begin(label) {
      if (ext && !hardwareBroken) {
        // WebGL2 note: EXT_disjoint_timer_query_webgl2 exposes only the
        // constants; createQuery/beginQuery/endQuery/getQueryParameter/
        // deleteQuery are core gl.* entry points (the EXT-suffixed methods
        // exist only on the WebGL1 extension). Calling them on `ext`
        // throws TypeError on every machine where the extension exists.
        const query = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        if (checkAndClearError()) {
          // Broken at the source (see the file header) — this begin()
          // never really started a hardware query. Substitute a CPU-timed
          // entry under the same label so the caller's matching end(label)
          // still finds something to close, same as if isHardware had
          // already been false when they called begin().
          gl.deleteQuery(query);
          hardwareBroken = true;
          pending.push({ label, t0: performance.now(), open: true });
          return;
        }
        pending.push({ label, query, open: true, polls: 0 });
      } else {
        pending.push({ label, t0: performance.now(), open: true });
      }
    },

    end(label) {
      const p = findOpen(label);
      if (!p) throw new Error(`[gl-debug] gpuTimer.end without begin: ${label}`);
      if (p.query) gl.endQuery(ext.TIME_ELAPSED_EXT);
      else p.t1 = performance.now();
      p.open = false;
    },

    /**
     * @returns {{done: boolean, disjoint: boolean, timings: Map<string, number>}}
     * `done` is false while any GPU query result is still pending — call
     * again later. `disjoint` true means the GPU clock was unreliable (or,
     * per the #480 note above, the hardware path turned out broken) and
     * the batch was discarded.
     */
    poll() {
      if (hardwareBroken) return { done: true, disjoint: true, timings: new Map() };
      const disjoint = ext ? !!gl.getParameter(ext.GPU_DISJOINT_EXT) : false;
      if (disjoint) {
        for (const p of pending) if (p.query) gl.deleteQuery(p.query);
        pending.length = 0;
        return { done: true, disjoint: true, timings: new Map() };
      }
      for (const p of pending) {
        if (p.open) return { done: false, disjoint: false, timings: new Map() };
        if (p.query) {
          const available = gl.getQueryParameter(p.query, ext.QUERY_RESULT_AVAILABLE_EXT);
          if (checkAndClearError()) {
            giveUpOnHardware();
            return { done: true, disjoint: true, timings: new Map() };
          }
          if (available) continue;
          p.polls += 1;
          if (p.polls > POLL_STALL_LIMIT) {
            giveUpOnHardware();
            return { done: true, disjoint: true, timings: new Map() };
          }
          return { done: false, disjoint: false, timings: new Map() };
        }
      }
      const timings = new Map();
      for (const p of pending) {
        const ms = p.query
          ? gl.getQueryParameter(p.query, ext.QUERY_RESULT_EXT) / 1e6
          : p.t1 - p.t0;
        if (p.query) gl.deleteQuery(p.query);
        timings.set(p.label, ms);
      }
      pending.length = 0;
      return { done: true, disjoint: false, timings };
    },
  };
}
