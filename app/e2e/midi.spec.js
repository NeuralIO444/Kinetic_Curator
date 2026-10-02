// e2e/midi.spec.js — #617: Web MIDI against a scripted fake device.
// window.__kcMidiAccess is the test hook so Chromium's native MIDI prompt
// cannot hang the suite (that was the 60s timeout).
import { test, expect } from '@playwright/test';

test.describe.configure({ timeout: 20_000 });

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

async function boot(page, extraScript = '') {
  await page.addInitScript(({ doc, extra }) => {
    localStorage.setItem('kc:first-run-seen', '1');
    localStorage.setItem('kc:project:v1', JSON.stringify({
      version: 1, savedAt: new Date().toISOString(), doc,
    }));
    if (extra) eval(extra);
  }, { doc: DOC, extra: extraScript || fakeAccessScript() });
  await page.goto('/Kinetic_Curator/?boot=factory', { waitUntil: 'domcontentloaded' });
  await page.locator('.app').waitFor({ timeout: 15_000 });
  await page.getByRole('tab', { name: /director/i }).click();
  return page.locator('.davis-midi');
}

test('MIDI: enable, pad, knob, hold, unplug', async ({ page }) => {
  const midi = await boot(page);
  await expect(midi.locator('.davis-midi-status')).toContainText('MIDI off', { timeout: 3_000 });
  await expect(midi.locator('.davis-midi-map li')).toHaveCount(3, { timeout: 3_000 });

  await midi.getByRole('button', { name: 'ENABLE' }).click();
  await expect(midi.locator('.davis-midi-status')).toContainText('1 device: Test Pad', { timeout: 3_000 });

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
  await expect(depth).toHaveValue('1', { timeout: 3_000 });
  await page.evaluate(() => window.__midi.send([0xb0, 7, 0]));
  await expect(depth).toHaveValue('0', { timeout: 3_000 });

  await page.getByRole('tab', { name: /director/i }).click();
  await page.evaluate(() => window.__midi.send([0x90, 38, 100]));
  await expect(freeze).toHaveText('THAW', { timeout: 3_000 });
  await page.evaluate(() => window.__midi.unplug());
  await expect(freeze).toHaveText('FREEZE', { timeout: 3_000 });
  await expect(midi.locator('.davis-midi-status')).toContainText('no MIDI device found', { timeout: 3_000 });
  await expect(midi.locator('.davis-midi-note')).toContainText('unplugged: Test Pad', { timeout: 3_000 });
  await expect(midi.locator('.davis-midi-map li')).toHaveCount(3);

  await midi.getByRole('button', { name: 'Unmap FREEZE (hold)' }).click();
  await expect(midi.locator('.davis-midi-map li')).toHaveCount(2);
  await midi.getByRole('button', { name: 'ON', exact: true }).click();
  await expect(midi.locator('.davis-midi-status')).toContainText('MIDI off', { timeout: 3_000 });
});

test('MIDI: a refused permission says so', async ({ page }) => {
  const midi = await boot(page, `window.__kcMidiAccess = async () => { throw new DOMException('Permission denied', 'SecurityError'); };`);
  await midi.getByRole('button', { name: 'ENABLE' }).click();
  await expect(midi.locator('.davis-midi-status')).toContainText('MIDI access refused', { timeout: 3_000 });
  await expect(midi.locator('.davis-midi-note')).toContainText('site settings', { timeout: 3_000 });
});

test('MIDI: a browser without Web MIDI says so', async ({ page }) => {
  const midi = await boot(page, `window.__kcMidiAccess = null; delete Navigator.prototype.requestMIDIAccess;`);
  await midi.getByRole('button', { name: 'ENABLE' }).click();
  await expect(midi.locator('.davis-midi-status')).toContainText('not available', { timeout: 3_000 });
});
