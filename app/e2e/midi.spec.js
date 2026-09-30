// e2e/midi.spec.js — #617: Web MIDI end to end, against a scripted fake device
// (the browser's real MIDI stack is replaced by window.__midi; a real
// controller is verified by hand). Covers the mapped pad, the mapped knob, the
// FREEZE hold, unplugging mid-set, and the two honest failures.
import { test, expect } from '@playwright/test';

const FAKE = `
  window.__midi = { input: null, access: null,
    send(bytes) { this.input.onmidimessage({ data: new Uint8Array(bytes), target: this.input }); },
    unplug() { this.input.state = 'disconnected'; this.access.onstatechange({}); } };
  navigator.requestMIDIAccess = async () => {
    const input = { name: 'Test Pad', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([['in0', input]]), onstatechange: null };
    window.__midi.input = input; window.__midi.access = access;
    return access;
  };
`;
const doc = {
  version: 1, seed: 4242, autoQuality: false,
  layoutParams: { mode: 'swarm', count: 40, accumulation: true },
  midiMap: { 'note:1:36': 'evolve.toggle', 'note:1:38': 'accum.freeze', 'cc:1:7': 'param.audioModDepth' },
};

async function boot(page, initScript) {
  await page.addInitScript(initScript);
  await page.goto('/Kinetic_Curator/?boot=factory', { waitUntil: 'domcontentloaded' });
  await page.evaluate((d) => {
    localStorage.setItem('kc:first-run-seen', '1');
    localStorage.setItem('kc:project:v1', JSON.stringify({ version: 1, savedAt: new Date().toISOString(), doc: d }));
  }, doc);
  await page.reload({ waitUntil: 'load' });
  await page.locator('.app').waitFor({ timeout: 30_000 });
  await page.getByRole('tab', { name: /davis/i }).click();
  return page.locator('.davis-midi');
}

test('MIDI: enable, pad, knob, hold, unplug', async ({ page }) => {
  const midi = await boot(page, FAKE);
  await expect(midi.locator('.davis-midi-status')).toContainText('MIDI off');
  // mappings saved in the project are listed, by name
  await expect(midi.locator('.davis-midi-map li')).toHaveCount(3);
  await expect(midi.locator('.davis-midi-map')).toContainText('EVOLVE / STOP');
  await expect(midi.locator('.davis-midi-map')).toContainText('note 36 · ch 1');

  await midi.getByRole('button', { name: 'ENABLE' }).click();
  await expect(midi.locator('.davis-midi-status')).toContainText('1 device: Test Pad');

  // a pad fires its mapping exactly like the on-screen button, and again to toggle off
  const evolve = page.locator('.panel-davis').getByRole('button', { name: /^(EVOLVE|STOP)$/ });
  await expect(evolve).toHaveText('EVOLVE');
  await page.evaluate(() => window.__midi.send([0x90, 36, 100]));
  await expect(evolve).toHaveText('STOP');
  await expect(midi.locator('.davis-midi-last')).toContainText('note 36 · ch 1 · vel 100');
  await page.evaluate(() => { window.__midi.send([0x80, 36, 0]); }); // pad release: no toggle
  await expect(evolve).toHaveText('STOP');
  await page.evaluate(() => window.__midi.send([0x90, 36, 100]));
  await expect(evolve).toHaveText('EVOLVE');

  // FREEZE is a hold: down engages (button follows), up releases
  const freeze = page.locator('.panel-davis').getByRole('button', { name: /^(FREEZE|THAW)$/ });
  await expect(freeze).toHaveText('FREEZE');
  await page.evaluate(() => window.__midi.send([0x90, 38, 100]));
  await expect(freeze).toHaveText('THAW');
  await page.evaluate(() => window.__midi.send([0x80, 38, 0]));
  await expect(freeze).toHaveText('FREEZE');

  // a knob drives a slider across its whole range
  await page.getByRole('tab', { name: /stimuli/i }).click();
  await page.getByText('ADVANCED').click();
  const depth = page.locator('.stim-advanced input[type=range]').first(); // DEPTH is the first reactivity slider
  await page.evaluate(() => window.__midi.send([0xb0, 7, 127]));
  await expect(depth).toHaveValue('1');
  await page.evaluate(() => window.__midi.send([0xb0, 7, 0]));
  await expect(depth).toHaveValue('0');

  // unplugging mid-hold: the freeze is released and the status names the device
  await page.getByRole('tab', { name: /davis/i }).click();
  await page.evaluate(() => window.__midi.send([0x90, 38, 100]));
  await expect(freeze).toHaveText('THAW');
  await page.evaluate(() => window.__midi.unplug());
  await expect(freeze).toHaveText('FREEZE');
  await expect(midi.locator('.davis-midi-status')).toContainText('no MIDI device found');
  await expect(midi.locator('.davis-midi-note')).toContainText('unplugged: Test Pad');
  // the mappings stay: they are project data, not device state
  await expect(midi.locator('.davis-midi-map li')).toHaveCount(3);

  // unmap one, and turning MIDI off goes quiet
  await midi.getByRole('button', { name: 'Unmap FREEZE (hold)' }).click();
  await expect(midi.locator('.davis-midi-map li')).toHaveCount(2);
  await midi.getByRole('button', { name: 'ON', exact: true }).click();
  await expect(midi.locator('.davis-midi-status')).toContainText('MIDI off');
});

test('MIDI: a refused permission says so, and how to fix it', async ({ page }) => {
  const midi = await boot(page, `navigator.requestMIDIAccess = async () => { throw new DOMException('Permission denied', 'SecurityError'); };`);
  await midi.getByRole('button', { name: 'ENABLE' }).click();
  await expect(midi.locator('.davis-midi-status')).toContainText('MIDI access refused');
  await expect(midi.locator('.davis-midi-note')).toContainText("site settings");
});

test('MIDI: a browser without Web MIDI says so', async ({ page }) => {
  const midi = await boot(page, `delete Navigator.prototype.requestMIDIAccess; try { delete navigator.requestMIDIAccess; } catch (e) {} Object.defineProperty(navigator, 'requestMIDIAccess', { value: undefined, configurable: true });`);
  await midi.getByRole('button', { name: 'ENABLE' }).click();
  await expect(midi.locator('.davis-midi-status')).toContainText('not available');
});
