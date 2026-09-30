// feels.selfcheck.mjs — #615 STIMULI FEEL: Gentle / Punchy / Violent.
//
//  A. the presets: exactly the 8 reactivity params, valid, inspectable, and
//     PUNCHY is the factory reactivity (so nothing moves for existing users).
//  B. distinct at the SAME audio: same hit → scale ordering GENTLE < PUNCHY <
//     VIOLENT; attack opens faster the more violent; GENTLE lingers longest.
//  C. applyFeel: sets the 8 params in ONE undo step, honours locks, no-ops on
//     unknown/repeat; the active feel is derived (CUSTOM after any tweak);
//     the selection persists in the project document (layoutParams).
//  D. the face is three feels; the 8 raw sliders survive behind ADVANCED.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { FEEL_KEYS, FEEL_PRESETS, activeFeelId, feelReadout } from './feels.js';
import { DEFAULT_LAYOUT_PARAMS, validateLayoutParams } from './layout-modes.js';
import { audioRoutes } from '../gl/audioRoutes.mjs';
import { processBallistics, createBallisticsState, sanitizeBallistics } from '../gl/audioBallistics.mjs';
import { useStore } from '../state/store.js';
import { serializeProject, parseProject } from '../state/projectDocument.js';

const byId = (id) => FEEL_PRESETS.find((f) => f.id === id);

// ── A ────────────────────────────────────────────────────────────────────
assert.deepStrictEqual(FEEL_PRESETS.map((f) => f.id), ['gentle', 'punchy', 'violent']);
assert.strictEqual(FEEL_KEYS.length, 8);
for (const f of FEEL_PRESETS) {
  assert.deepStrictEqual(Object.keys(f.params).sort(), [...FEEL_KEYS].sort(), `${f.id} sets exactly the 8 params`);
  assert.deepStrictEqual(validateLayoutParams(f.params).rejected, [], `${f.id} validates clean`);
  assert.ok(/depth .* swell/.test(feelReadout(f)), `${f.id}: every number is printable`);
}
for (const k of FEEL_KEYS) assert.strictEqual(byId('punchy').params[k], DEFAULT_LAYOUT_PARAMS[k], `PUNCHY.${k} is the factory value`);
assert.strictEqual(activeFeelId(DEFAULT_LAYOUT_PARAMS), 'punchy', 'a fresh piece reads PUNCHY');

// ── B ────────────────────────────────────────────────────────────────────
{
  const hit = { bass: 0.8, rms: 0.6, beatPulse: 1 };
  const scale = (id) => audioRoutes(hit, {
    depth: byId(id).params.audioModDepth, scaleMod: byId(id).params.audioScaleMod, alphaMod: byId(id).params.audioAlphaMod,
  }).scaleMul;
  assert.ok(scale('gentle') < scale('punchy') && scale('punchy') < scale('violent'),
    `same hit, distinct feels: ${scale('gentle').toFixed(3)} < ${scale('punchy').toFixed(3)} < ${scale('violent').toFixed(3)}`);
  const env = (id, frames) => {
    const p = sanitizeBallistics({ attackMs: byId(id).params.audioAttackMs, releaseMs: byId(id).params.audioDecayMs, curve: byId(id).params.audioResponse });
    const st = createBallisticsState();
    let v = 0;
    for (let i = 0; i < frames; i++) v = processBallistics(st, { rms: 1 }, 16.7, p).rms;
    return { st, p, v };
  };
  const rise = { g: env('gentle', 3).v, p: env('punchy', 3).v, v: env('violent', 3).v };
  assert.ok(rise.g < rise.p && rise.p < rise.v, `attack: the gentler the slower to open (${rise.g.toFixed(2)} < ${rise.p.toFixed(2)} < ${rise.v.toFixed(2)})`);
  const fall = (id) => { const e = env(id, 60); let v = e.v; for (let i = 0; i < 5; i++) v = processBallistics(e.st, { rms: 0 }, 16.7, e.p).rms; return v; };
  // Tails: GENTLE lingers longest by a wide margin. (PUNCHY is the factory
  // exponential curve, which crushes a falling value fast, so its visible tail is
  // the shortest; VIOLENT's peak-hold falls linearly. Not a monotone ladder, by design.)
  assert.ok(fall('gentle') > 0.3 && fall('gentle') > fall('punchy') + 0.2 && fall('gentle') > fall('violent') + 0.2, 'decay: GENTLE lingers longest');
  assert.strictEqual(new Set(['gentle', 'punchy', 'violent'].map((id) => fall(id).toFixed(3))).size, 3, 'three distinct tails');
}

// ── C ────────────────────────────────────────────────────────────────────
{
  const S = () => useStore.getState();
  useStore.setState({ lockedParams: {}, historyUndoStack: [], historyRedoStack: [] });
  assert.strictEqual(activeFeelId(S().layoutParams), 'punchy');
  S().applyFeel('violent');
  for (const k of FEEL_KEYS) assert.strictEqual(S().layoutParams[k], byId('violent').params[k], `applyFeel sets ${k}`);
  assert.strictEqual(activeFeelId(S().layoutParams), 'violent');
  assert.strictEqual(S().historyUndoStack.length, 1, 'one gesture = one undo step');
  S().undo();
  assert.strictEqual(activeFeelId(S().layoutParams), 'punchy', 'one undo restores the previous feel');
  const depth = S().historyUndoStack.length;
  S().applyFeel('punchy');
  assert.strictEqual(S().historyUndoStack.length, depth, 're-applying the current feel is a no-op');
  S().applyFeel('nope');
  assert.strictEqual(activeFeelId(S().layoutParams), 'punchy', 'unknown id is a no-op');
  // a locked param is the performer's taste: the feel leaves it alone
  useStore.setState({ lockedParams: { audioModDepth: true } });
  S().applyFeel('gentle');
  assert.strictEqual(S().layoutParams.audioModDepth, byId('punchy').params.audioModDepth, 'locked param untouched');
  assert.strictEqual(S().layoutParams.audioAttackMs, byId('gentle').params.audioAttackMs, 'unlocked params still set');
  assert.strictEqual(activeFeelId(S().layoutParams), 'custom', 'a partly-locked feel reads CUSTOM, honestly');
  useStore.setState({ lockedParams: {} });
  // any raw-slider tweak leaves the feel
  S().applyFeel('gentle');
  S().setLayoutParam('audioAttackMs', 121);
  assert.strictEqual(activeFeelId(S().layoutParams), 'custom', 'tweaking an Advanced slider reads CUSTOM');
  // selection persists in the project document
  S().applyFeel('violent');
  const doc = serializeProject(S());
  assert.strictEqual(activeFeelId(parseProject(JSON.parse(JSON.stringify(doc))).doc.layoutParams), 'violent', 'the feel round-trips through the project document');
  useStore.setState({ historyUndoStack: [], historyRedoStack: [] });
}

// ── D ────────────────────────────────────────────────────────────────────
{
  const panel = readFileSync(new URL('../panels/StimulusPanel.jsx', import.meta.url), 'utf8');
  assert.ok(/<FeelPicker /.test(panel), 'the panel face shows the three feels');
  assert.ok(/<details className="stim-advanced"[^]*<ReactivityControls [^]*<\/details>/.test(panel), 'the 8 raw sliders survive behind ADVANCED');
  assert.ok(/useState\(false\)[^\n]*advanced|advancedOpen, setAdvancedOpen\] = useState\(false\)/.test(panel), 'ADVANCED is collapsed by default');
  const picker = readFileSync(new URL('../panels/stimulus/FeelPicker.jsx', import.meta.url), 'utf8');
  assert.ok(/feelReadout\(f\)/.test(picker), 'hover shows every number a feel sets');
  assert.ok(!/SWARM|HYPE|MURM/i.test(picker), 'no voice chassis names: "vibe" here is audio only');
}
console.log('feels.selfcheck: OK');
