// #1973 — the topbar's palette controls (lab / harmony / shuffle) stay fully on-screen whatever the palette names are:
// long chip names used to push the block past the window's right edge, shuffle unreachable; and the harmony select
// was too narrow for "ANALOGOUS" (its final S cut). The chip strip yields; the controls never do.
import { test, expect } from '@playwright/test';

for (const [w, h] of [
  [1440, 900],
  [1180, 820],
  [1280, 800],
]) {
  test(`palette controls stay on-screen with long palette names at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await page.waitForSelector('.palette-controls');
    // the widest names the shipped palettes carry (VORTEX RWB / MURMURATION / NEON BROOD / PETRI BLOOM)
    await page.evaluate(() => {
      const names = ['VORTEX RWB', 'MURMURATION', 'NEON BROOD', 'PETRI BLOOM'];
      document.querySelectorAll('.palette-chip .palette-chip-name').forEach((el, i) => (el.textContent = names[i % 4]));
    });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const right = (el) => el.getBoundingClientRect().right;
      const sel = document.querySelector('.palette-harmony');
      const btns = [...document.querySelectorAll('.palette-controls .palette-save-btn')];
      // the longest harmony option, measured in the select's own font, against the room the select has
      const cs = getComputedStyle(sel);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const spacing = parseFloat(cs.letterSpacing) || 0;
      const longest = Math.max(
        ...[...sel.options].map((o) => ctx.measureText(o.textContent).width + spacing * o.textContent.length),
      );
      return {
        win: innerWidth,
        lab: right(btns[0]),
        harmony: right(sel),
        shuffle: right(btns[btns.length - 1]),
        room: sel.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 14, // the arrow
        longest,
      };
    });
    expect(r.shuffle, 'shuffle is fully on-screen').toBeLessThanOrEqual(r.win);
    expect(r.harmony, 'the harmony select is on-screen').toBeLessThanOrEqual(r.win);
    expect(r.lab, 'lab is on-screen').toBeLessThanOrEqual(r.win);
    expect(
      r.room,
      `the harmony select shows its longest option whole (${r.longest.toFixed(0)}px of ${r.room.toFixed(0)}px)`,
    ).toBeGreaterThanOrEqual(r.longest);
  });
}
