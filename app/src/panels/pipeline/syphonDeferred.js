// syphonDeferred.js — #608 (Pipeline STAGE Phase C) DEFERRED STUB.
//
// What this is: the seam where the live canvas will be published as a Syphon
// server (Mac GPU texture sharing). Every function exists so the final build
// has a contract to implement — every function is INERT (returns a "deferred"
// result, publishes nothing, touches no GPU state).
//
// TO UN-DEFER, all of this must be verified by hand on the Mac — it cannot
// be verified in CI or in a browser, and it was NOT verified here:
//   1. The Mac/Tauri build of KC-1 (Syphon is Mac GPU texture sharing; the
//      browser cannot publish a texture).
//   2. A Syphon receiver app to verify against: Syphon Simple Client or the
//      OBS Syphon input. Server must be visible with the correct canvas
//      raster and live frames, no tearing beyond the pipeline's own behavior.
//   3. Toggling off fully stops publishing — no ghost server.
//   4. Perf measured: publishing must not drop the live frame rate below the
//      governor's current tier target; the measured cost is reported.
// Syphon runs INDEPENDENT of the fullscreen stage mode (both can run; the
// existing UI already treats them as separate outputs).
//
// Hardware/software needed: a Mac running the Tauri build + a Syphon
// receiver app (Simple Client / OBS).

/**
 * Start publishing the live canvas as a Syphon server.
 * @returns {{ok:false, deferred:true, reason:string}}
 */
export function startSyphonPublish() {
  // DEFERRED (#608): needs the Mac/Tauri build plus a Syphon receiver to
  // verify the server is visible with the correct raster and live frames.
  return {
    ok: false,
    deferred: true,
    reason: 'DEFERRED (#608): needs the Mac/Tauri build and a Syphon receiver app (Simple Client / OBS) to verify publish.',
  };
}

/**
 * Publish one frame. No-op until startSyphonPublish is real.
 * @returns {{ok:false, deferred:true, reason:string}}
 */
export function publishSyphonFrame() {
  // DEFERRED (#608): frame publish path; measure its cost against the
  // governor tier target during the real build.
  return {
    ok: false,
    deferred: true,
    reason: 'DEFERRED (#608): no live server — frame publish is part of the real build.',
  };
}

/**
 * Stop publishing. Safe to call any time (idempotent no-op while deferred).
 * @returns {{ok:true, deferred:true}}
 */
export function stopSyphonPublish() {
  // Nothing is publishing, so there is nothing to stop — but the call is
  // kept so the toggle-off path exists before the real build lands.
  return { ok: true, deferred: true };
}

/**
 * Is Syphon even possible in this runtime?
 * @returns {{available:false, reason:string}}
 */
export function syphonCapability() {
  // Honest answer today: Syphon is Mac GPU texture sharing — the browser
  // build can never publish. The existing stageWindow.js syphonStatus()
  // asks the Tauri side; this stub keeps the UI honest until then.
  return { available: false, reason: 'Syphon needs the Mac/Tauri build (#608 deferred).' };
}
