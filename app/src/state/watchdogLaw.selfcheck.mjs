// node src/state/watchdogLaw.selfcheck.mjs
//
// #2481 — the pure law of the watchdog resume contract (Matt's rulings,
// 2026-11-24), pinned clause by clause:
//   (a) grace — a manual resume suppresses re-trips inside the window
//       and not after it;
//   (b) Space routing — a global resume while PERF PAUSED, from any
//       focus except a text-entry control;
//   (c) the reading — the pill/log text is the watchdog's OWN
//       measurement, in the terms the trip acted on.
// The slice wiring that consumes this law is pinned in
// state/watchdog.selfcheck.mjs; the governor hook's call sites consult
// inWatchdogGrace / pass the builders below at their trip points.

import assert from 'node:assert';
import {
  WATCHDOG_RESUME_GRACE_MS,
  watchdogGraceDeadline,
  inWatchdogGrace,
  isTextEntryTarget,
  shouldSpaceResume,
  fpsWatchdogReading,
  crawlWatchdogReading,
  stalledWatchdogReading,
  faultWatchdogReading,
  watchdogReadingShort,
  watchdogReadingLong,
} from './watchdogLaw.mjs';

// ── (a) grace window arithmetic ────────────────────────────────────────
{
  const resumeAt = 1_000_000;
  const until = watchdogGraceDeadline(resumeAt);
  assert.strictEqual(WATCHDOG_RESUME_GRACE_MS, 5000, 'the grace constant is 5s');
  assert.strictEqual(until, resumeAt + 5000, 'deadline = resume + grace');
  // A trip decision inside the window is suppressed…
  assert.strictEqual(inWatchdogGrace(resumeAt, until), true, 'grace at the resume instant');
  assert.strictEqual(inWatchdogGrace(resumeAt + 4999, until), true, 'grace 1ms before the deadline');
  // …and one at/after it is not.
  assert.strictEqual(inWatchdogGrace(resumeAt + 5000, until), false, 'no grace at the deadline');
  assert.strictEqual(inWatchdogGrace(resumeAt + 60_000, until), false, 'no grace long after');
  // No armed deadline is never grace.
  assert.strictEqual(inWatchdogGrace(resumeAt, 0), false, 'deadline 0 = unarmed');
  assert.strictEqual(inWatchdogGrace(resumeAt, null), false, 'deadline null = unarmed');
  assert.strictEqual(inWatchdogGrace(resumeAt, NaN), false, 'deadline NaN = unarmed');
  assert.strictEqual(watchdogGraceDeadline(NaN), 0, 'a junk resume time arms nothing');
}
console.log('watchdogLaw.selfcheck: OK (#2481 grace window)');

// ── (b) Space routing ──────────────────────────────────────────────────
{
  const btn = { tagName: 'BUTTON' };
  const div = { tagName: 'DIV' };
  const base = { key: ' ', watchdogStopped: true, target: btn };
  // The stress session's case: stop up, focus on a panel button → resume.
  assert.strictEqual(shouldSpaceResume(base), true, 'button focus: Space resumes');
  assert.strictEqual(shouldSpaceResume({ ...base, target: div }), true, 'stage focus: Space resumes');
  assert.strictEqual(shouldSpaceResume({ ...base, target: null }), true, 'no target: Space resumes');
  // The ruling's carve-out: typing in a text field keeps its Space.
  assert.strictEqual(shouldSpaceResume({ ...base, target: { tagName: 'INPUT' } }), false, 'input: no claim');
  assert.strictEqual(shouldSpaceResume({ ...base, target: { tagName: 'TEXTAREA' } }), false, 'textarea: no claim');
  assert.strictEqual(shouldSpaceResume({ ...base, target: { tagName: 'SELECT' } }), false, 'select: no claim');
  assert.strictEqual(
    shouldSpaceResume({ ...base, target: { tagName: 'DIV', isContentEditable: true } }),
    false,
    'contentEditable: no claim',
  );
  // Only while PERF PAUSED is up — otherwise Space is the normal toggle.
  assert.strictEqual(shouldSpaceResume({ ...base, watchdogStopped: false }), false, 'no stop: no claim');
  // Only an unmodified, fresh Space.
  assert.strictEqual(shouldSpaceResume({ ...base, key: 'Enter' }), false, 'other keys: no claim');
  assert.strictEqual(shouldSpaceResume({ ...base, repeat: true }), false, 'key repeat: no claim');
  assert.strictEqual(shouldSpaceResume({ ...base, ctrlKey: true }), false, 'ctrl chord: no claim');
  assert.strictEqual(shouldSpaceResume({ ...base, metaKey: true }), false, 'cmd chord: no claim');
  assert.strictEqual(shouldSpaceResume({ ...base, altKey: true }), false, 'alt chord: no claim');
  // isTextEntryTarget itself: case-insensitive tags, junk-safe.
  assert.strictEqual(isTextEntryTarget({ tagName: 'input' }), true, 'lowercase tag still a text entry');
  assert.strictEqual(isTextEntryTarget(null), false, 'null target is not a text entry');
  assert.strictEqual(isTextEntryTarget({}), false, 'bare object is not a text entry');
}
console.log('watchdogLaw.selfcheck: OK (#2481 Space routing)');

// ── (c) the reading is the watchdog's own measurement ──────────────────
{
  // fps-critical: the effective rate and its floor.
  const fps = fpsWatchdogReading(1.4, 10);
  assert.deepStrictEqual(fps, { kind: 'fps', at: 1.4, floor: 10 });
  assert.strictEqual(watchdogReadingShort(fps), '1fps');
  assert.match(watchdogReadingLong(fps), /1\.4fps, below the 10fps floor/);

  // crawl: a loop-time RATIO — the text must speak in ratio terms and
  // must never dress it as an fps against a threshold (the "2fps < 0"
  // lie this ruling replaces).
  const crawl = crawlWatchdogReading(0.12, 4000, 9);
  assert.deepStrictEqual(crawl, { kind: 'crawl', ratioPct: 12, wallMs: 4000, frames: 9 });
  assert.strictEqual(watchdogReadingShort(crawl), 'loop 12%');
  const crawlLong = watchdogReadingLong(crawl);
  assert.match(crawlLong, /12% of wall across 4\.0s \(9 frames\)/);
  assert.ok(!/fps/.test(crawlLong), 'crawl text never claims an fps');

  // stall: a duration of silence.
  const stall = stalledWatchdogReading(2000);
  assert.strictEqual(watchdogReadingShort(stall), 'frame stalled');
  assert.match(watchdogReadingLong(stall), /no completed frame for 2\.0s/);

  // correctness trips: the fault label is the reading.
  const fault = faultWatchdogReading('accum-nan');
  assert.strictEqual(watchdogReadingShort(fault), 'accum-nan');
  assert.strictEqual(watchdogReadingLong(fault), 'accum-nan');

  // Junk in, empty text out — the pill falls back to its bare label.
  assert.strictEqual(watchdogReadingShort(null), '');
  assert.strictEqual(watchdogReadingLong(undefined), '');
  assert.strictEqual(watchdogReadingShort({ kind: 'mystery' }), '');
}
console.log('watchdogLaw.selfcheck: OK (#2481 trip readings)');
