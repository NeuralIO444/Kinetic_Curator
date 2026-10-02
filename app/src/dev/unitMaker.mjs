// Dev-menu units maker. Pure. The panel copies the stub; CI still runs the file you save.

export const UNIT_TRIO = {
  selfcheck: ['paletteImportCopy', 'clock.workerDt', 'units'],
  playwright: ['smoke', 'living-boot', 'director-regroup'],
  qa: ['palette-import', 'wash-mode', 'fx-finish-grain-rgb'],
};

export function makeUnit({ issue = '000', name = 'unit' } = {}) {
  const title = String(name).trim() || 'unit';
  const n = String(issue).replace(/\D/g, '') || '000';
  return `// #${n} — ${title}
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('#${n} ${title}', () => {
  assert.equal(true, true);
});
`;
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
