// governorThresholds.mjs — the pure law for the governor's shed/recover
// threshold pair (#2482, on top of the #259 hysteresis law).
//
// The pair's law, all of it enforced here so every writer — the GOV TUNE
// panel, the agent-UI bridge, the governor's own reconcile — gets the
// same answer from the same arithmetic:
//
//   1. GAP (#259): shed stays strictly below recover, by at least
//      GOVERNOR_MIN_GAP_FPS. One shared threshold above a machine's
//      sustainable rate was the original permanent-shed trap.
//   2. SCREEN (#2482, Matt's ruling 2026-11-24): recover never exceeds
//      what this display can actually reach. The governor recovers when
//      its effective fps — min(rAF rate, GPU-implied rate) — reaches
//      recover, and the rAF rate is vsync-bound, so a recover of 120 on
//      a 60 Hz screen made shed cuts un-clearable for the whole session
//      while the panel text claimed the trap couldn't come back.
//      The reachable max is MEASURED from the running loop's frame
//      deltas (fpsMath.estimateRefreshFps), never hard-coded; until a
//      measurement exists, only the absolute cap binds.
//   3. RANGE: the pair's long-standing absolute domain, 1..120.
//
// Session-only like the thresholds themselves (#259): nothing here is
// serialized, and the display measurement is this tab's hardware truth,
// not project content.

/** The pair's absolute floor (fps). */
export const GOVERNOR_FPS_MIN = 1;
/** The pair's absolute ceiling (fps) — the panel's range since #259. */
export const GOVERNOR_FPS_ABSOLUTE_MAX = 120;
/** Shed stays at least this far below recover (the #259 apart-law). */
export const GOVERNOR_MIN_GAP_FPS = 1;

/**
 * The highest recover this machine may hold: the measured display max
 * when one exists, else the absolute cap. A measurement below the
 * pair's floor is no measurement (defensive — the estimator never
 * returns one, but a stale or hostile store value must not make the
 * pair unrepresentable).
 */
export function effectiveMaxFps(displayMaxFps) {
  const measured = Number(displayMaxFps);
  if (!Number.isFinite(measured) || measured < GOVERNOR_FPS_MIN + GOVERNOR_MIN_GAP_FPS) {
    return GOVERNOR_FPS_ABSOLUTE_MAX;
  }
  return Math.min(GOVERNOR_FPS_ABSOLUTE_MAX, Math.floor(measured));
}

/**
 * Parse a would-be threshold, keeping the setters' long-standing
 * contract exactly: a truthy number is a request (rounded); 0, '',
 * NaN and other non-numbers keep the current value, so a stray bridge
 * call or a cleared field can never zero the pair. (Negative requests
 * flow through and land on the clamps' floors, as they always have.)
 */
function parseThreshold(v, current) {
  const n = Number(v);
  return n ? Math.round(n) : current;
}

/**
 * Clamp a recover request against the pair law. The screen ceiling is
 * applied LAST so it always binds: when the pair is degenerate (shed
 * sitting at/above the screen max — only reachable via a value written
 * before the first measurement), recover holds the screen line and the
 * pair reconcile pulls shed down under it.
 *
 * @returns {{value: number, clamped: boolean,
 *   reason: null|'screen'|'gap'|'range', maxFps: number}}
 */
export function clampRecoverFps(v, { shedFps, displayMaxFps = null, current }) {
  const maxFps = effectiveMaxFps(displayMaxFps);
  const asked = parseThreshold(v, current);
  let value = asked;
  let reason = null;
  const floor = shedFps + GOVERNOR_MIN_GAP_FPS;
  if (value < floor) {
    value = floor;
    reason = 'gap';
  }
  if (value < GOVERNOR_FPS_MIN) {
    value = GOVERNOR_FPS_MIN;
    reason = 'range';
  }
  if (value > maxFps) {
    value = maxFps;
    reason = displayMaxFps != null && maxFps < GOVERNOR_FPS_ABSOLUTE_MAX ? 'screen' : 'range';
  }
  return { value, clamped: value !== asked, reason, maxFps };
}

/**
 * Clamp a shed request against the pair law: below recover by the gap,
 * and below the screen max by the gap too (a lawful recover never
 * exceeds the max, so the gap ceiling is the binding one in every
 * lawful state; the screen ceiling only bites while the pair is
 * degenerate, keeping each setter independently lawful).
 *
 * @returns {{value: number, clamped: boolean,
 *   reason: null|'screen'|'gap'|'range', maxFps: number}}
 */
export function clampShedFps(v, { recoverFps, displayMaxFps = null, current }) {
  const maxFps = effectiveMaxFps(displayMaxFps);
  const asked = parseThreshold(v, current);
  let value = asked;
  let reason = null;
  if (value < GOVERNOR_FPS_MIN) {
    value = GOVERNOR_FPS_MIN;
    reason = 'range';
  }
  const gapCeiling = recoverFps - GOVERNOR_MIN_GAP_FPS;
  if (value > gapCeiling) {
    value = gapCeiling;
    reason = 'gap';
  }
  const screenCeiling = maxFps - GOVERNOR_MIN_GAP_FPS;
  if (value > screenCeiling) {
    value = screenCeiling;
    reason = 'screen';
  }
  return { value, clamped: value !== asked, reason, maxFps };
}

/**
 * Re-derive a lawful pair from stored values under a (possibly fresh)
 * display measurement: recover takes the screen line first, then shed
 * is pulled under it. The governor runs this when the measurement
 * lands or rises, so a value written before the first measurement —
 * the one moment an unreachable recover can exist — is corrected by
 * the measurement itself, not left as a session-long trap.
 */
export function reconcileThresholdPair({ shedFps, recoverFps }, displayMaxFps = null) {
  const recover = clampRecoverFps(recoverFps, { shedFps, displayMaxFps, current: recoverFps }).value;
  const shed = clampShedFps(shedFps, { recoverFps: recover, displayMaxFps, current: shedFps }).value;
  return { shedFps: shed, recoverFps: recover };
}

/**
 * The performer's clamp note (ruling 2: a clamped value is never a
 * silent adjustment). `kind` is the row being edited — the gap note
 * names the OTHER threshold, the way the panel's own footnote does.
 */
export function clampNoteFor(outcome, kind) {
  if (!outcome || !outcome.clamped) return null;
  switch (outcome.reason) {
    case 'screen':
      return `screen max ${outcome.maxFps}`;
    case 'range':
      return `max ${GOVERNOR_FPS_ABSOLUTE_MAX}`;
    case 'gap':
      return kind === 'recover' ? 'must stay above shed' : 'must stay below recover';
    default:
      return null;
  }
}
