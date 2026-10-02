// Dev-menu units maker and debug log. Pure. CI still runs the file you save.

export const UNIT_TRIO = {
  selfcheck: ['paletteImportCopy', 'clock.workerDt', 'units'],
  playwright: ['smoke', 'living-boot', 'director-regroup'],
  qa: ['palette-import', 'wash-mode', 'fx-finish-grain-rgb'],
};

export function makeUnit({ issue = '000', name = 'unit' } = {}) {
  const title = String(name).trim() || 'unit';
  const n = String(issue).replace(/\D/g, '') || '000';
  const file = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unit';
  return {
    file: `src/${file}.selfcheck.mjs`,
    src: `// #${n} — ${title}
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('#${n} ${title}', () => {
  assert.fail('fill this: one behavior, then delete this line');
});
`,
  };
}

export function pushUnitCheck(name, ok, detail = '') {
  const row = { name, ok: !!ok, detail, t: Date.now() };
  if (typeof globalThis.window !== 'undefined') {
    const log = (globalThis.window.__kcUnits = globalThis.window.__kcUnits || []);
    log.push(row);
    if (log.length > 40) log.shift();
  }
  return row;
}

export function readUnitLog() {
  if (typeof globalThis.window === 'undefined') return [];
  return [...(globalThis.window.__kcUnits || [])];
}

export function clearUnitLog() {
  if (typeof globalThis.window !== 'undefined') globalThis.window.__kcUnits = [];
  return [];
}
