// e2e/midi.spec.js — #617: Web MIDI against a scripted fake device.
// window.__kcMidiAccess is the test hook so Chromium's native MIDI prompt
// cannot hang the suite (that was the 60s timeout).
import { test, expect } from '@playwright/test';

// No describe timeout: the default 60s applies, like every other spec. The
// 20s cap this used to carry guarded against Chromium's native MIDI prompt
// hanging the suite — that prompt is gone now (window.__kcMidiAccess below),
// and on CI's software GL this boot alone measures ~16s of that budget, so
// the cap was timing out a healthy boot, not catching a hang.

const DOC = {
  version: 1, seed: 4242, autoQuality: false,
  layoutParams: { mode: 'swarm', count: 40, accumulation: true },
  midiMap: { 'note:1:36': 'evolve.toggle', 'note:1:38': 'accum.freeze', 'cc:1:7': 'param.audioModDepth' },
};

function fakeAccessScript() {
  return `
    window.__kcMidiAccess = async () => {
      const input = { name: 'Test Pad', state: 'connected', onmidimessage: null };
      const access = {
        inputs: { values() { return [input][Symbol.iterator](); } },
        onstatechange: null,
      };
      window.__midi = {
        input, access,
        send(bytes) { input.onmidimessage?.({ data: new Uint8Array(bytes), target: input }); },
        unplug() { input.state = 'disconnected'; access.onstatechange?.({}); },
      };
      return access;
    };
  `;
}

// #1725 — the panel keeps the slim row (MIDI button + status read) and the
// key legend; the setup itself (ENABLE, the status line, the bank bar, the
// LEARN rows) lives in the floating editor the button launches. Returns the
// editor locator; the panel is `page.locator('.davis-midi')` when a test
// needs the row or the legend.
async function openEditor(page) {
  const editor = page.locator('.midi-editor');
  if (!(await editor.isVisible().catch(() => false))) {
    await page.locator('.davis-midi').getByRole('button', { name: 'MIDI' }).click();
    await expect(editor).toBeVisible({ timeout: 15_000 });
  }
  return editor;
}

async function boot(page, extraScript = '') {
  await page.addInitScript(({ doc, extra }) => {
    localStorage.setItem('kc:first-run-seen', '1');
    localStorage.setItem('kc:project:v1', JSON.stringify({
      version: 1, savedAt: new Date().toISOString(), doc,
    }));
    if (extra) eval(extra);
  }, { doc: DOC, extra: extraScript || fakeAccessScript() });
  await page.goto('/Kinetic_Curator/?boot=factory', { waitUntil: 'domcontentloaded' });
  // 30s for the shell, same as director-regroup: software GL paints the
  // seeded project slowly, and a slow boot must fail as itself — not as a
  // stability hang further down.
  await page.locator('.app').waitFor({ timeout: 30_000 });
  await page.getByRole('tab', { name: /director/i }).click();
  const panel = page.locator('.davis-midi');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await panel.scrollIntoViewIfNeeded();
  return openEditor(page);
}

async function enable(midi) {
  const btn = midi.getByRole('button', { name: 'ENABLE' });
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ force: true });
}

test('MIDI: enable, pad, knob, hold, unplug', async ({ page }) => {
  // This runner paints on software GL at ~5-7.5x the cost of a GPU machine
  // (cache-verify: 7.5s under local emulation, 56.1s on CI). The body below
  // measures 11.5s emulated — 60-86s on the runner, over the default 60.
  // The other two tests are a third of its steps and stay on the default.
  test.setTimeout(180_000);
  const midi = await boot(page);
  const panel = page.locator('.davis-midi');
  await expect(midi.locator('.davis-midi-status')).toContainText('MIDI off', { timeout: 3_000 });
  // every target is a row now (learn needs them all); a MAPPED row is one with an Unmap button
  await expect(midi.getByRole('button', { name: /^Unmap / })).toHaveCount(3, { timeout: 3_000 });
  // #1725 — the panel row reads the truth at a glance, and the legend stayed
  // in the panel: the seeded project's three bindings read there, not in the modal.
  await expect(panel.locator('.davis-midi-state')).toContainText('off');
  await expect(panel.locator('.davis-midi-legend-head')).toContainText('keys · MAIN');
  await expect(panel.locator('.davis-midi-legend li')).toHaveCount(3);

  await enable(midi);
  await expect(midi.locator('.davis-midi-status')).toContainText('1 device: Test Pad', { timeout: 3_000 });
  await expect(panel.locator('.davis-midi-state')).toContainText('on · MAIN');

  const evolve = page.locator('.panel-davis').getByRole('button', { name: /^(EVOLVE|STOP)$/ });
  await expect(evolve).toHaveText('EVOLVE', { timeout: 3_000 });
  await page.evaluate(() => window.__midi.send([0x90, 36, 100]));
  await expect(evolve).toHaveText('STOP', { timeout: 3_000 });
  await expect(midi.locator('.davis-midi-last')).toContainText('note 36 · ch 1 · vel 100', { timeout: 3_000 });
  await page.evaluate(() => window.__midi.send([0x80, 36, 0]));
  await expect(evolve).toHaveText('STOP', { timeout: 3_000 });
  await page.evaluate(() => window.__midi.send([0x90, 36, 100]));
  await expect(evolve).toHaveText('EVOLVE', { timeout: 3_000 });

  const freeze = page.locator('.panel-davis').getByRole('button', { name: /^(FREEZE|THAW)$/ });
  await expect(freeze).toHaveText('FREEZE', { timeout: 3_000 });
  await page.evaluate(() => window.__midi.send([0x90, 38, 100]));
  await expect(freeze).toHaveText('THAW', { timeout: 3_000 });
  await page.evaluate(() => window.__midi.send([0x80, 38, 0]));
  await expect(freeze).toHaveText('FREEZE', { timeout: 3_000 });

  await page.getByRole('tab', { name: /stimuli/i }).click();
  await page.getByText('ADVANCED').click();
  const depth = page.locator('.stim-advanced input[type=range]').first();
  await page.evaluate(() => window.__midi.send([0xb0, 7, 127]));
  // #1478 — the master DEPTH now spans 0..2, so a controller's full travel reads 2 (it read 1 when the ceiling was 1)
  await expect(depth).toHaveValue('2', { timeout: 3_000 });
  await page.evaluate(() => window.__midi.send([0xb0, 7, 0]));
  await expect(depth).toHaveValue('0', { timeout: 3_000 });

  await page.getByRole('tab', { name: /director/i }).click();
  // The tab switch may have closed the editor (a remounted panel starts
  // shut); reopen it — the store kept everything.
  await openEditor(page);
  // #1725 — a bank switch made inside the modal: the panel legend follows.
  // A new bank is empty, so the legend falls silent and the row names it.
  await midi.locator('button[title="New bank"]').click();
  await expect(panel.locator('.davis-midi-state')).toContainText('on · BANK 2');
  await expect(panel.locator('.davis-midi-legend-head')).toHaveCount(0);
  await expect(panel.locator('.davis-midi-legend li')).toHaveCount(0);
  await midi.locator('.davis-midi-bank select').selectOption({ label: 'MAIN' });
  await expect(panel.locator('.davis-midi-state')).toContainText('on · MAIN');
  await expect(panel.locator('.davis-midi-legend li')).toHaveCount(3);

  await page.evaluate(() => window.__midi.send([0x90, 38, 100]));
  await expect(freeze).toHaveText('THAW', { timeout: 3_000 });
  await page.evaluate(() => window.__midi.unplug());
  await expect(freeze).toHaveText('FREEZE', { timeout: 3_000 });
  await expect(midi.locator('.davis-midi-status')).toContainText('no MIDI device found', { timeout: 3_000 });
  await expect(midi.locator('.davis-midi-note')).toContainText('unplugged: Test Pad', { timeout: 3_000 });
  await expect(midi.getByRole('button', { name: /^Unmap / })).toHaveCount(3);

  await midi.getByRole('button', { name: 'Unmap FREEZE (hold)' }).click();
  await expect(midi.getByRole('button', { name: /^Unmap / })).toHaveCount(2);
  await midi.getByRole('button', { name: 'ON', exact: true }).click();
  await expect(midi.locator('.davis-midi-status')).toContainText('MIDI off', { timeout: 3_000 });
  // …and the panel row falls back to its one word for it.
  await expect(panel.locator('.davis-midi-state')).toContainText('off');
});

test('MIDI: a refused permission says so', async ({ page }) => {
  const midi = await boot(page, `window.__kcMidiAccess = async () => { throw new DOMException('Permission denied', 'SecurityError'); };`);
  await enable(midi);
  await expect(midi.locator('.davis-midi-status')).toContainText('MIDI access refused', { timeout: 3_000 });
  await expect(midi.locator('.davis-midi-note')).toContainText('site settings', { timeout: 3_000 });
});

test('MIDI: a browser without Web MIDI says so', async ({ page }) => {
  const midi = await boot(page, `window.__kcMidiAccess = null; delete Navigator.prototype.requestMIDIAccess;`);
  await enable(midi);
  await expect(midi.locator('.davis-midi-status')).toContainText('not available', { timeout: 3_000 });
});
