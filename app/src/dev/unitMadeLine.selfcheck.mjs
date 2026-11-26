// unitMadeLine.selfcheck.mjs — A18 (#2496): DEV → UNITS MAKE answered a
// press with silence in every build. The draft for the pre-filled values
// (issue 722, 'behave ease') was already on screen at mount, so pressing
// MAKE recomputed the identical template: no visible change, no
// confirmation, and the draft's file name was never shown at all. Making
// a unit writes nothing by design — the reader saves the file — so the
// press must say exactly that, in one line, and the panel must show the
// name the draft wants. These groups pin the line, the panel wiring, and
// the agent-UI registry's description of the control.
// Run: node src/dev/unitMadeLine.selfcheck.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as unitMaker from './unitMaker.mjs';
import { controlById } from '../agentUi/uiRegistry.mjs';

const { makeUnit } = unitMaker;
const unitMadeLine = unitMaker.unitMadeLine || (() => null);

const panelSrc = readFileSync(new URL('../panels/UnitsPanel.jsx', import.meta.url), 'utf8');

test('MAKE answers with a line: the helper exists and names the draft', () => {
  assert.equal(
    typeof unitMaker.unitMadeLine,
    'function',
    `unitMadeLine must exist so a MAKE press can answer; got ${typeof unitMaker.unitMadeLine}`,
  );
  const filed = makeUnit({ issue: '722', name: 'behave ease' });
  const line = unitMadeLine(filed);
  assert.equal(
    line,
    'drafted src/behave-ease.selfcheck.mjs — nothing was written; save the template under that name and CI runs the file you save',
    `the filed repro's press must answer with the honest line; got ${JSON.stringify(line)}`,
  );
});

test('the line names the file each draft wants, not a fixed one', () => {
  const other = makeUnit({ issue: '2496', name: 'units make speaks' });
  const line = unitMadeLine(other);
  assert.ok(
    line.includes('src/units-make-speaks.selfcheck.mjs'),
    `line must name this draft's file (src/units-make-speaks.selfcheck.mjs); got ${JSON.stringify(line)}`,
  );
});

test('the line never claims a write happened', () => {
  const line = unitMadeLine(makeUnit({ issue: '722', name: 'behave ease' }));
  assert.match(line, /nothing was written/, `line must state no file was written; got ${JSON.stringify(line)}`);
  assert.doesNotMatch(
    line,
    /\bsaved\b|\bwrote\b|written to/i,
    `line must not claim a save; got ${JSON.stringify(line)}`,
  );
  assert.equal(unitMadeLine(null), '', `no draft, no line; got ${JSON.stringify(unitMadeLine(null))}`);
  assert.equal(unitMadeLine({}), '', `a draft without a file earns no line; got ${JSON.stringify(unitMadeLine({}))}`);
});

test('the panel shows the draft name and answers the press', () => {
  assert.ok(
    panelSrc.includes('{made.file}'),
    'UnitsPanel must render made.file — on base the draft name is computed and never shown',
  );
  assert.ok(panelSrc.includes('unitMadeLine(made)'), 'UnitsPanel must render the made line for the current draft');
  assert.match(
    panelSrc,
    /\{\s*pressed && <p style=\{\{ opacity: 0\.75 \}\}>\{unitMadeLine\(made\)\}<\/p>\s*\}/,
    'the made line must appear only after a MAKE press, so even an unchanged template answers visibly',
  );
  assert.ok(
    panelSrc.includes('setMade(makeUnit({ issue, name }))') && panelSrc.includes('setPressed(true)'),
    'the MAKE press must draft from the current inputs and raise the answer in the same handler',
  );
});

test('the panel header scopes "dev server only" to running, not to MAKE', () => {
  assert.doesNotMatch(
    panelSrc,
    /This is the dev server only/,
    'the old header claimed the whole panel was dev-server only; MAKE works in any build',
  );
  assert.match(
    panelSrc,
    /running them is dev server only/,
    'the header must scope the dev-server limit to the RUN harness',
  );
  assert.match(
    panelSrc,
    /you save the file yourself/,
    'the header must say saving the draft is the reader\u2019s move',
  );
});

test('the registry description of the control stays truthful', () => {
  const ctl = controlById('dev.units-run');
  assert.ok(ctl, 'dev.units-run must stay registered');
  assert.doesNotMatch(
    ctl.does,
    /makes a unit through the dev server/,
    `MAKE never goes through the dev server; description was ${JSON.stringify(ctl.does)}`,
  );
  assert.match(
    ctl.does,
    /drafts a unit template/,
    `description must name MAKE as drafting a template; got ${JSON.stringify(ctl.does)}`,
  );
});
