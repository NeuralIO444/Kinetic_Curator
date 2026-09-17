// Shared helpers for the live WebGL canvas (issue #224 — the SVG tree is
// gone from the live path, so node-count assertions read the CanvasPanel
// header pill, which the loop reports through the store's setNodeCount).
import { expect } from '@playwright/test';

/** Parse the "N NODES" pill in the CanvasPanel header. */
export async function glNodeCount(page) {
  const text = await page
    .locator('.panel-canvas .meter-pill', { hasText: /NODES/i })
    .first()
    .textContent();
  return parseInt(text || '0', 10) || 0;
}

/** Wait until the live loop has rendered at least one frame. */
export async function waitForLiveFrame(page, timeout = 30_000) {
  await expect
    .poll(() => glNodeCount(page), { timeout })
    .toBeGreaterThan(0);
}
