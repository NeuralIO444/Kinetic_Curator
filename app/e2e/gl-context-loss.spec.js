// Regression: WebGL context loss must not wedge the canvas black forever (#263).
//
// Repro from the issue (DevTools Rendering panel -> WEBGL_lose_context):
// lose the context, the canvas goes permanently black and the UI says
// nothing; only a reload recovers. After the fix the loop holds frames,
// MasterBar shows a fault pill, and on restore the renderer cold-restarts,
// textures rebake, and the scene comes back without a reload.
import { test, expect } from '@playwright/test';
import { waitForLiveFrame } from './gl-helpers.js';

test.describe('WebGL context loss (#263)', () => {
  test('canvas recovers after lose/restore with a visible fault pill', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('kc:first-run-seen', '1');
      } catch { /* ignore */ }
    });

    // GL-side errors only — ignore unrelated page noise. Note: headless
    // SwiftShader deterministically reports one transient "[gl] framebuffer
    // incomplete" on the first FBO completeness check after a context
    // (re)creation (also happens on main at initial load, before any loss);
    // the tick catches it, retries, and rendering continues. That single
    // known-transient is allowed; anything else — or the transient
    // repeating, which would mean the restore path is wedged — fails.
    const glErrors = [];
    let faultWindow = false;
    page.on('console', (m) => {
      if (faultWindow && m.type() === 'error' && /\[gl-live\]|\[gl\]/.test(m.text())) {
        glErrors.push(m.text());
      }
    });
    page.on('pageerror', (e) => {
      if (faultWindow) glErrors.push(`pageerror: ${e.message}`);
    });

    await page.goto('/');
    await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
    const gl = page.locator('.canvas-gl').first();
    await expect(gl).toBeVisible();
    await waitForLiveFrame(page);

    // Healthy session: no fault pill.
    await expect(page.locator('.status-pill', { hasText: 'GL CONTEXT LOST' })).toHaveCount(0);
    await expect(page.locator('.status-pill', { hasText: 'GL RESTORING' })).toHaveCount(0);

    // Force context loss via the WEBGL_lose_context extension.
    faultWindow = true;
    await gl.evaluate((c) => {
      const glc = c.getContext('webgl2');
      const ext = glc.getExtension('WEBGL_lose_context');
      if (!ext) throw new Error('WEBGL_lose_context unavailable');
      // Keep the handle: getExtension may return null while the context is lost.
      window.__loseExt = ext;
      ext.loseContext();
    });

    // While the context is down, the UI says so instead of pretending
    // everything is fine.
    await expect(page.locator('.status-pill', { hasText: 'GL CONTEXT LOST' }))
      .toBeVisible({ timeout: 10_000 });

    // Restore — the loop must come back on its own, no reload.
    await gl.evaluate(() => {
      window.__loseExt.restoreContext();
    });

    // 'GL RESTORING' may flash during the rebake; either way both pills
    // clear once the scene is back (only after the rebake re-uploads the
    // atlas onto the new session).
    const faultPill = page.locator('.status-pill', { hasText: /GL CONTEXT LOST|GL RESTORING/ });
    await expect(faultPill).toHaveCount(0, { timeout: 60_000 });

    // The loop is still alive and presenting frames without a reload.
    await waitForLiveFrame(page);
    const transient = glErrors.filter((e) => e.includes('[gl] framebuffer incomplete'));
    const real = glErrors.filter((e) => !e.includes('[gl] framebuffer incomplete'));
    expect(real, `unexpected GL errors during the fault window: ${real.join(' | ')}`).toEqual([]);
    // The known-transient may fire once per restore; repeating means wedged.
    expect(transient.length).toBeLessThanOrEqual(2);
    faultWindow = false;
  });
});
