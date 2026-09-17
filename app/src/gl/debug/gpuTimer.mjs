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

export function createGpuTimer(gl) {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const pending = [];

  function findOpen(label) {
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].label === label && pending[i].open) return pending[i];
    }
    return null;
  }

  return {
    /** True when real GPU timestamps are in use (false = CPU fallback). */
    get isHardware() {
      return !!ext;
    },

    begin(label) {
      if (ext) {
        // WebGL2 note: EXT_disjoint_timer_query_webgl2 exposes only the
        // constants; createQuery/beginQuery/endQuery/getQueryParameter/
        // deleteQuery are core gl.* entry points (the EXT-suffixed methods
        // exist only on the WebGL1 extension). Calling them on `ext`
        // throws TypeError on every machine where the extension exists.
        const query = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        pending.push({ label, query, open: true });
      } else {
        pending.push({ label, t0: performance.now(), open: true });
      }
    },

    end(label) {
      const p = findOpen(label);
      if (!p) throw new Error(`[gl-debug] gpuTimer.end without begin: ${label}`);
      if (ext) gl.endQuery(ext.TIME_ELAPSED_EXT);
      else p.t1 = performance.now();
      p.open = false;
    },

    /**
     * @returns {{done: boolean, disjoint: boolean, timings: Map<string, number>}}
     * `done` is false while any GPU query result is still pending — call
     * again later. `disjoint` true means the GPU clock was unreliable and
     * the batch was discarded.
     */
    poll() {
      const disjoint = ext ? !!gl.getParameter(ext.GPU_DISJOINT_EXT) : false;
      if (disjoint) {
        for (const p of pending) if (p.query) gl.deleteQuery(p.query);
        pending.length = 0;
        return { done: true, disjoint: true, timings: new Map() };
      }
      for (const p of pending) {
        if (p.open) return { done: false, disjoint: false, timings: new Map() };
        if (p.query && !gl.getQueryParameter(p.query, ext.QUERY_RESULT_AVAILABLE_EXT)) {
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
