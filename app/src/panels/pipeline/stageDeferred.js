// stageDeferred.js — #607 (Pipeline STAGE Phase B) DEFERRED STUB.
//
// What this is: the seam where a fullscreen live-output window on a REAL
// SECOND DISPLAY will attach. Every function exists so the final build has a
// contract to implement — every function is INERT (returns a "deferred"
// result, changes nothing, opens nothing).
//
// TO UN-DEFER, all of this must be verified by hand — it cannot be verified
// in CI or in a browser, and it was NOT verified here:
//   1. A real second display attached to the Mac Studio (Tauri build only).
//   2. Stage window opens fullscreen on the SELECTED display (not the primary).
//   3. Mapping Fit / Fill / 1:1 correct at 16:9 AND 9:16 canvases.
//   4. Blackout is instant and recovers without re-creating the window.
//   5. Unplugging the display while staging fails OUT LOUD — no silent
//      freeze, no zombie window.
// The live instrument's Preview mode is the safe default and is unaffected
// by this stub: nothing here runs unless explicitly called.
//
// Hardware needed: a second physical display + the Mac/Tauri build of KC-1.

/** Display descriptor the real build will return. */
export const STAGE_MAPPING_MODES = ['fit', 'fill', '1:1'];

/** @returns {{deferred:true, displays:[], reason:string}} */
export function listStageDisplays() {
  // DEFERRED (#607): display enumeration needs Tauri's display API and a
  // real second display. In the browser there is no honest way to enumerate
  // displays, so this returns empty instead of guessing.
  return {
    deferred: true,
    displays: [],
    reason: 'DEFERRED (#607): no second display attached for verification — enumerate via Tauri display API during the real build.',
  };
}

/**
 * Open the stage window fullscreen on a specific display.
 * @returns {{ok:false, deferred:true, reason:string}}
 */
export function openStageOnDisplay() {
  // DEFERRED (#607): needs a real second display to verify the window lands
  // on the SELECTED display fullscreen, borderless, with the right raster.
  return {
    ok: false,
    deferred: true,
    reason: 'DEFERRED (#607): attach a second display to the Mac Studio and verify fullscreen-on-selected-display in the Tauri build.',
  };
}

/**
 * Set the stage mapping: 'fit' | 'fill' | '1:1'.
 * @returns {{ok:false, deferred:true, reason:string}}
 */
export function setStageMapping() {
  // DEFERRED (#607): verify mapping correctness visually at 16:9 and 9:16
  // canvases on the real second display.
  return {
    ok: false,
    deferred: true,
    reason: 'DEFERRED (#607): verify Fit/Fill/1:1 on a real second display at 16:9 and 9:16.',
  };
}

/**
 * Show/hide the stage test pattern.
 * @returns {{ok:false, deferred:true, reason:string}}
 */
export function showStageTestPattern() {
  // DEFERRED (#607): test pattern needs the stage window to exist first.
  return {
    ok: false,
    deferred: true,
    reason: 'DEFERRED (#607): blocked on openStageOnDisplay — no stage window without a second display.',
  };
}
