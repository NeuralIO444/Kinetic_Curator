// e2e/audio-sidecar.spec.js — #618: the FILE source says honestly what is driving
// reactivity, and a bad sidecar is refused with a reason (never a crash, never a lie).
// UI-only on purpose: no playback, so nothing here depends on runner audio timing
// (the deterministic replay is selfchecked in gl/audioSidecar.selfcheck.mjs).
import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';

// a 0.2 s, 8 kHz mono 16-bit WAV of silence: the smallest thing <audio> accepts
function tinyWav() {
  const n = 1600;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  return b;
}
const sidecar = (over = {}) => JSON.stringify({
  schema: 'kc-audio-envelope/1', fps: 10, duration: 4, tempo_bpm: 120,
  frames: Array.from({ length: 41 }, (_, i) => ({ t: i / 10, rms: i / 40, flux: 0.2, beat_phase: 0 })),
  beats: [0.5, 1, 1.5], ...over,
});

test('FILE source: sidecar status, refusal reasons, and drop', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: /stimuli/i }).click();
  await page.getByRole('button', { name: /setup/i }).click();
  const status = page.locator('.stim-source-status');

  await expect(status).toContainText('MIC · live analysis');
  await expect(page.locator('.stim-sidecar-pick')).toHaveCount(0); // a sidecar needs a file

  await page.locator('input[type=file][accept="audio/*"]').setInputFiles({ name: 'take.wav', mimeType: 'audio/wav', buffer: tinyWav() });
  await expect(status).toContainText('FILE · no sidecar — live analysis');

  const pick = page.locator('.stim-sidecar-pick input[type=file]');
  await pick.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"frames": []}') });
  await expect(status).toContainText('sidecar ignored: no usable frames');
  await pick.setInputFiles({ name: 'junk.json', mimeType: 'application/json', buffer: Buffer.from('not json at all') });
  await expect(status).toContainText('sidecar ignored: not valid JSON');

  await pick.setInputFiles({ name: 'take.audio.json', mimeType: 'application/json', buffer: Buffer.from(sidecar()) });
  await expect(status).toContainText('FILE · SIDECAR take.audio.json · 41 frames · 0:04');
  await expect(status.locator('.stim-source-tag')).toHaveText('FILE+ENV');

  await page.getByTitle('Drop the sidecar and go back to live analysis').click();
  await expect(status).toContainText('FILE · no sidecar — live analysis');
});
