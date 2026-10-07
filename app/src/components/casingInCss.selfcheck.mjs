// #1029 (M3): casing lives in CSS. A .jsx file may not gain a new .toUpperCase() /
// .toLowerCase() — use the .lbl / .act / .ttl / .name utilities in styles/controls.css.
// BASELINE is the count that existed when M3 landed (search keys, class names, select
// options). It only ever goes down: lower a number when you remove a call.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = new URL('..', import.meta.url).pathname;
const BASELINE = {
  'components/HotkeyOverlay.jsx': 2, 'components/PaletteStrip.jsx': 1, 'components/PaletteWing.jsx': 2,
  'components/TapeCounter.jsx': 1, 'panels/AssetPoolPanel.jsx': 3, 'panels/CanvasPanel.jsx': 1,
  'panels/build/LayerStack.jsx': 6, 'panels/build/MathEffectEditor.jsx': 3, 'panels/davis/BehaveReadout.jsx': 2,
  'panels/davis/EvolveControls.jsx': 1, 'panels/davis/VoiceDish.jsx': 1, 'panels/layout/AccumFamily.jsx': 2,
  'panels/layout/ChipRows.jsx': 2, 'panels/layout/StructureToggles.jsx': 1, 'panels/pipeline/StageView.jsx': 1,
  'panels/stimulus/MeterHero.jsx': 1, 'panels/stimulus/ModMatrix.jsx': 3,
};
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const bad = [];
for (const p of walk(SRC)) {
  if (!p.endsWith('.jsx')) continue;
  const rel = relative(SRC, p);
  const n = readFileSync(p, 'utf8').split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .reduce((a, l) => a + (l.match(/\.to(Upper|Lower)Case\(\)/g) || []).length, 0);
  if (n > (BASELINE[rel] || 0)) bad.push(`${rel}: ${n} case calls, baseline ${BASELINE[rel] || 0}`);
}
if (bad.length) { console.error('new .toUpperCase()/.toLowerCase() in JSX (use .lbl/.act/.ttl/.name):\n' + bad.join('\n')); process.exit(1); }
console.log('casingInCss.selfcheck: ok');
