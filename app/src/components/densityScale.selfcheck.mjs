// #1031 (M6): one density scale. STIMULI matrix, PIPELINE and DIRECTORS rules use only
// the 2/4/6/8/12/16/24 gaps; the route row is 44px, the matrix header and PIPELINE rows 28px.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const css = readFileSync(new URL('../styles/panels.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const SCALE = new Set([0, 2, 4, 6, 8, 12, 16, 24]);
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const scoped = rules.filter((r) => /\.(stim-matrix|stim-route|stim-feel|pipeline-(body|row|section)|davis-)/.test(r.sel));

for (const r of scoped) {
  for (const m of r.body.matchAll(/(?:^|[;\s])(?:gap|row-gap|column-gap)\s*:\s*([^;]+);/g)) {
    for (const v of m[1].match(/\d+(?:\.\d+)?px/g) || []) {
      assert.ok(SCALE.has(parseFloat(v)), `${r.sel}: gap ${v} is off the 2/4/6/8/12/16/24 scale`);
    }
  }
}
const body = (sel) => rules.find((r) => r.sel === sel)?.body || '';
assert.match(body('.stim-route'), /min-height:\s*44px/, 'route rows are 44px');
assert.match(body('.stim-matrix-head'), /min-height:\s*28px/, 'matrix header is a 28px label row');
assert.match(body('.pipeline-row'), /min-height:\s*28px/, 'PIPELINE form rows are 28px');
console.log('densityScale.selfcheck: ok');
