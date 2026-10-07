// loisLines.selfcheck.mjs — M7 (#1032): exactly one signed voice-1 line per panel,
// shown only in its empty / naming moment, never on a live control.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { LOIS_LINES } from './loisLines.mjs';

const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [ok] ${name}`); };

ok('the four signed lines are verbatim', () => {
  assert.deepEqual({ ...LOIS_LINES }, {
    build: 'NOTHING ON STAGE — a plate with no cast is a room.',
    stimuli: 'SILENT — sound is in the room and nothing is listening.',
    play: 'NO SETLIST — a night with no next plate is just this one.',
    director: "NAME THE PLATE — a roll you didn't name didn't happen.",
  });
});

const SITES = {
  build: ['./BuildPanel.jsx', /trackCount <= 1 && <div className="lois-line name">\{LOIS_LINES\.build\}/],
  stimuli: ['./stimulus/ModMatrix.jsx', /table\.length === 0 && <div className="stim-matrix-empty name">\{LOIS_LINES\.stimuli\}/],
  play: ['./davis/QueueTransport.jsx', /empty && <div className="lois-line name">\{LOIS_LINES\.play\}/],
  director: ['./DavisPanel.jsx', /hitCount === 0 && <div className="lois-line name">\{LOIS_LINES\.director\}/],
};
for (const [key, [file, gate]] of Object.entries(SITES)) {
  ok(`${key}: one line, behind its empty-state gate, with .name so casing leaves it alone`, () => {
    const s = src(file);
    assert.equal((s.match(/LOIS_LINES\.\w+/g) || []).length, 1, `${file} carries exactly one voice-1 line`);
    assert.ok(gate.test(s), `${file} gates the ${key} line on its empty state`);
  });
}

ok('no other panel renders a LOIS line, and none sits on a live control', () => {
  const files = ['./BuildPanel.jsx', './DavisPanel.jsx', './StimulusPanel.jsx', './PlayPanel.jsx', './stimulus/ModMatrix.jsx', './davis/QueueTransport.jsx', './PipelinePanel.jsx', './CanvasPanel.jsx', './AssetPoolPanel.jsx'];
  const users = files.filter((f) => /LOIS_LINES/.test(src(f)));
  assert.deepEqual(users.sort(), ['./BuildPanel.jsx', './DavisPanel.jsx', './davis/QueueTransport.jsx', './stimulus/ModMatrix.jsx']);
  for (const f of users) assert.ok(!/<(button|input|select)[^>]*>\s*\{LOIS_LINES/.test(src(f)), `${f}: a voice-1 line is never inside a control`);
});

ok('the old stimuli sentence (voice 2) is gone: it would be a second line', () => {
  assert.ok(!/No routes: sound drives nothing/.test(src('./stimulus/ModMatrix.jsx')));
});

ok('the palette wing keeps its one line, unchanged', () => {
  assert.match(src('../components/PaletteWing.jsx'), /NAME IT — VOID didn't become real from hex values/);
});

console.log(`loisLines.selfcheck: ${n} checks passed`);
