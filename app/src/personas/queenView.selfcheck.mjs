// node src/personas/queenView.selfcheck.mjs
// #2389 (Persona Kernel P9, spec §4 Q12) — queenView(): one READ-ONLY aggregator over existing getters. This suite
// FAILS if the module imports any setter, dispatch, emit, subscribe or writer (an import-graph check, proved to bite on
// a planted bad import), runs the aggregate against a store whose every function throws, and checks it reads each
// source: every persona's private state, the ledgers, the Archive, the Wire's typed empty slot, her looks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { queenView, QUEEN_VIEW_SECTIONS, QUEEN_VIEW_SCHEMA, WIRE_SLOT, timeOfNight } from './queenView.mjs';
import { loisGrudge } from '../curator/loisGrudge.mjs';
import { CHAPTERS, chapterLooks } from '../data/chapters.js';
import { recordGovernorEvent, clearGovernorEvents } from '../gl/governorEventLog.mjs';
import { noteRhythmLook, noteRhythmTiming, resetRhythm } from './rhythmRecord.mjs';

let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`  [ok] ${name}`);
};
const SRC = readFileSync(new URL('./queenView.mjs', import.meta.url), 'utf8');

// ── the read-only law, as an import graph ─────────────────────────────────────────────────────────────────
/** Every name the readers may import: getters and pure reads. Anything else fails. */
const READERS = new Set([
  'getLoisVerdict',
  'getLoisVerdictParts',
  'getLoisGrudges',
  'getLastDecisions',
  'getTrioView',
  'conductHeat',
  'getStoryView',
  'getRoomFeed',
  'getStressState',
  'getTaste',
  'ledgerCounts',
  'getGovernorEvents',
  'isRecordingPerformance',
  'performanceFrames',
  'isPlaybackActive',
  'getBandView',
  'bundledArchiveFiles',
  'getRhythmLooks',
  'getRhythmTiming',
  'getWireView',
]);
const WRITER = /^(set|dispatch|emit|on|off|note|push|append|write|save|store|update|clear|reset|start|stop|subscribe|record|ensure|create|schedule|use|apply|replay|end|init|bump|assign|mark|export|download|flip|toggle|commit|delete|remove|load)/i;

/** The import problems of a module's source: [] = read-only. */
function importProblems(text) {
  const problems = [];
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const m of code.matchAll(/^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm)) {
    const clause = m[1].trim();
    if (!clause.startsWith('{') || !clause.endsWith('}')) {
      problems.push(`${m[2]}: a default or namespace import (${clause}) — name each reader`);
      continue;
    }
    for (const part of clause.slice(1, -1).split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (WRITER.test(name)) problems.push(`${m[2]}: ${name} is a setter / dispatch / emit / subscribe`);
      else if (!READERS.has(name)) problems.push(`${m[2]}: ${name} is not a known reader`);
    }
  }
  if (/\bimport\s*\(/.test(code)) problems.push('a dynamic import');
  if (/\bemit\s*\(|\bdispatch\s*\(|\.setState\s*\(|setItem\s*\(|\bfetch\s*\(|console\.\w+\s*\(/.test(code))
    problems.push('a write, a dispatch, an emit, a fetch or a log in the body');
  return problems;
}

ok('read-only: every import is a named READER; no setter, dispatch, emit, subscribe, writer, fetch or log', () => {
  assert.deepEqual(importProblems(SRC), []);
});

ok('the check bites: a planted setter, dispatch, emit or subscribe import FAILS it', () => {
  const plant = (line) => `${line}\n${SRC}`;
  for (const bad of [
    "import { setBandTap } from './bandRecord.mjs';",
    "import { emit } from '../composition/eventBus.js';",
    "import { dispatch } from '../state/store.js';",
    "import { subscribeStory } from '../curator/storyLive.js';",
    "import { useStore } from '../state/store.js';",
    "import * as bus from '../composition/eventBus.js';",
    "import { getStoryView, noteRhythmLook } from './rhythmRecord.mjs';",
    "import { loisGrudge } from '../curator/loisGrudge.mjs';",
  ])
    assert.ok(importProblems(plant(bad)).length > 0, bad);
  assert.ok(importProblems(`${SRC}\nemit('x', 1);`).length > 0, 'an emit in the body');
});

ok('nothing outside KC-1: no file system, network, other app or microphone', () => {
  const code = SRC.replace(/\/\/.*$/gm, '');
  assert.ok(!/node:|fs['"]|@tauri|fetch|XMLHttpRequest|WebSocket|getUserMedia|navigator\./.test(code));
});

// ── the aggregate ─────────────────────────────────────────────────────────────────────────────────────────
const trap = () => {
  throw new Error('queenView called a function it was handed');
};
const STATE = { keeps: [{ id: 1 }, { id: 2 }, { id: 3 }], seed: 9, setSeed: trap, dispatch: trap, roll: trap };
const ACTIVITY = { idleMs: 4200, keepsLast5m: 2, keepTrend: [0, 1, 2], rollCadence: [3], noteCut: trap };

ok('it writes nothing and calls nothing it is handed: a store whose every function throws is read safely', () => {
  const v = queenView({ state: STATE, activity: ACTIVITY, hour: 2 });
  assert.equal(v.schema, QUEEN_VIEW_SCHEMA);
  assert.deepEqual(Object.keys(v).filter((k) => k !== 'schema'), [...QUEEN_VIEW_SECTIONS]);
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.ledgers));
  assert.deepEqual(JSON.parse(JSON.stringify(v)), v, 'plain data only — no function, no live object');
  assert.equal(STATE.keeps.length, 3, 'the store is unchanged');
});

ok('the ledgers: keeps, passes, takes, taste version, dwell, time of night', () => {
  const v = queenView({ state: STATE, activity: ACTIVITY, hour: 2 });
  assert.equal(v.ledgers.keeps, 3);
  assert.deepEqual(Object.keys(v.ledgers.ledger).sort(), ['keeps', 'passes']);
  assert.deepEqual(v.ledgers.takes, { recording: false, frames: 0, playing: false });
  assert.equal(v.ledgers.tasteVersion, null);
  assert.equal(v.ledgers.dwellMs, 4200);
  assert.equal(v.ledgers.keepsLast5m, 2);
  assert.equal(v.ledgers.timeOfNight, 'deep');
  assert.deepEqual([0, 6, 13, 19, 23, 24, -1, 1.5].map(timeOfNight), ['deep', 'morning', 'day', 'evening', 'night', null, null, null]);
});

ok("every persona's private state: COVER's verdict and grudges, OVERLAP's heat and skips, horns, the Governor", () => {
  const ch = CHAPTERS.find((c) => chapterLooks(c.id).length);
  assert.ok(loisGrudge.noteCut({ chapterId: ch.id, lookId: chapterLooks(ch.id)[0].id }), 'a real cut tallied');
  clearGovernorEvents();
  recordGovernorEvent({ type: 'shed', cutKind: 'fxaa' });
  const v = queenView({ state: STATE, activity: ACTIVITY, hour: 12 });
  assert.ok(v.cover.grudges && Array.isArray(v.cover.grudges.rows) && v.cover.grudges.rows.length >= 1, 'his grudges');
  assert.ok('verdict' in v.cover && 'parts' in v.cover && 'decision' in v.cover);
  assert.equal(typeof v.overlap.heat, 'number', 'his conducting heat');
  assert.ok(Array.isArray(v.overlap.skips) && 'decision' in v.overlap && 'trio' in v.overlap);
  assert.ok('band' in v.horns && Array.isArray(v.horns.calls));
  assert.ok(Array.isArray(v.governor.sheds) && v.governor.sheds.length >= 1, 'the Governor’s cuts');
  assert.ok('budget' in v.governor && Array.isArray(v.governor.cuts));
  assert.ok('story' in v.room && Array.isArray(v.room.feed));
  clearGovernorEvents();
});

ok('the Archive (array of shelves), the Wire (typed, empty slot while the Wire is off or its shelf is empty), her looks', () => {
  resetRhythm();
  noteRhythmTiming({ phrase: 3, enterEarlyMs: 10, breathePct: 0.01, tightMs: 0 });
  noteRhythmLook({ phrase: 3, motion: 'busy' });
  const v = queenView({});
  assert.ok(Array.isArray(v.archive), 'the Archive');
  assert.deepEqual(v.wire, { schema: 'kc-wire/0', built: false, items: [] });
  assert.ok(Object.isFrozen(WIRE_SLOT) && Object.isFrozen(WIRE_SLOT.items));
  assert.deepEqual(v.looks.readings, [{ phrase: 3, motion: 'busy' }]);
  assert.deepEqual(v.looks.timing, { phrase: 3, enterEarlyMs: 10, breathePct: 0.01, tightMs: 0 });
  resetRhythm();
  assert.deepEqual(queenView({}).looks.readings, []);
});

ok('a source that throws is an absent read, never a throw', () => {
  assert.doesNotThrow(() => queenView({ state: { get keeps() { throw new Error('x'); } } }));
});

console.log(`queenView.selfcheck: ${n} checks passed`);
