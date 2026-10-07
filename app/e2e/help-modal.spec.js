// #1043 — the Help modal: sized in viewport percent, 44px rows, an About tab with the
// signed content, and nothing that leaves the screen.
import { test, expect } from '@playwright/test';

async function openHelp(page) {
  await page.addInitScript(() => { try { localStorage.setItem('kc:first-run-seen', '1'); } catch { /* ignore */ } });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('?');
  await expect(page.locator('.hotkey-card')).toBeVisible();
}

for (const [w, h] of [[1280, 720], [1920, 1080], [900, 600]]) {
  test(`the card is ~70% of a ${w}x${h} viewport, fits, and every row and tab is 44px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openHelp(page);
    const card = (await page.locator('.hotkey-card').boundingBox());
    expect(card.width, 'about 70% wide').toBeGreaterThanOrEqual(Math.min(560, w * 0.92) - 1);
    expect(card.width).toBeLessThanOrEqual(w * 0.92 + 1);
    expect(Math.abs(card.width - w * 0.7), 'width tracks the viewport').toBeLessThan(w >= 1000 ? 4 : w * 0.25);
    expect(card.x).toBeGreaterThanOrEqual(-1);
    expect(card.x + card.width).toBeLessThanOrEqual(w + 1);
    expect(card.y).toBeGreaterThanOrEqual(-1);
    expect(card.y + card.height, 'never taller than the viewport').toBeLessThanOrEqual(h + 1);
    expect(card.height).toBeLessThanOrEqual(h * 0.9 + 1);
    for (const tab of ['help', 'keys', 'settings', 'about']) {
      await page.locator('.hotkey-tabs').getByRole('tab', { name: tab }).click();
      const tabs = await page.locator('.hotkey-tabs [role=tab]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      for (const t of tabs) expect(t, `tab height on ${tab}`).toBeGreaterThanOrEqual(43.5);
      const rows = await page.locator('.hotkey-row, .hotkey-link').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      for (const r of rows) expect(r, `row height on ${tab}`).toBeGreaterThanOrEqual(43.5);
    }
  });
}

test('type scales up with the card', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openHelp(page);
  const small = await page.locator('.hotkey-row .hotkey-desc, .hotkey-row').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  await page.setViewportSize({ width: 2560, height: 1440 });
  const big = await page.locator('.hotkey-row .hotkey-desc, .hotkey-row').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(small).toBeGreaterThanOrEqual(13);
  expect(big).toBeGreaterThan(small);
});

test('the card has no shadow, no radius and no inline style; the scrim keeps its blur', async ({ page }) => {
  await openHelp(page);
  const card = await page.locator('.hotkey-card').evaluate((e) => {
    const cs = getComputedStyle(e);
    return { shadow: cs.boxShadow, radius: cs.borderRadius, inline: [...e.querySelectorAll('[style]')].length + (e.getAttribute('style') ? 1 : 0), border: cs.borderTopWidth };
  });
  expect(card.shadow).toBe('none');
  expect(card.radius).toBe('0px');
  expect(card.inline, 'no inline style attributes inside the modal').toBe(0);
  expect(card.border).toBe('1px');
  const scrim = await page.locator('.hotkey-overlay').evaluate((e) => getComputedStyle(e).backdropFilter);
  expect(scrim).toContain('blur');
});

test('About: exact name, mailto email and https links, a photo, no emoji', async ({ page }) => {
  await openHelp(page);
  await page.locator('.hotkey-tabs').getByRole('tab', { name: 'about' }).click();
  await expect(page.getByRole('heading', { name: 'Kinetic Curator by Matt Ciaglia' })).toBeVisible();
  const mail = page.locator('.hotkey-about a[href^="mailto:"]');
  await expect(mail).toHaveCount(1);
  await expect(mail).toHaveAttribute('href', 'mailto:neural_io_444@icloud.com');
  const web = page.locator('.hotkey-about a[href="https://www.mattciaglia.com/"]');
  await expect(web).toHaveText('www.mattciaglia.com');
  await expect(web).toHaveAttribute('target', '_blank');
  await expect(web).toHaveAttribute('rel', /noopener/);
  await expect(web).toHaveAttribute('rel', /noreferrer/);
  const hrefs = await page.locator('.hotkey-about a').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs).toEqual([
    'https://www.mattciaglia.com/', 'mailto:neural_io_444@icloud.com', 'https://www.instagram.com/prismthief',
    'https://github.com/NeuralIO444', 'https://blockwalk.io',
  ]);
  const img = page.locator('.hotkey-about-photo');
  await expect(img).toBeVisible();
  expect(await img.evaluate((e) => e.complete && e.naturalWidth > 0), 'the photo loads').toBe(true);
  const text = await page.locator('.hotkey-card').innerText();
  expect(text).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|\uFE0F/u);
});

test('the open paths still work: ? toggles, the settings button opens settings, Escape closes', async ({ page }) => {
  await openHelp(page);
  await expect(page.locator('.hotkey-tabs [aria-selected=true]')).toHaveText('help');
  await page.keyboard.press('Escape');
  await expect(page.locator('.hotkey-card')).toHaveCount(0);
  await page.getByTitle('Settings — no second prefs store').click();
  await expect(page.locator('.hotkey-tabs [aria-selected=true]')).toHaveText('settings');
  await page.keyboard.press('Escape');
  await page.getByTitle('Help', { exact: true }).click();
  await expect(page.locator('.hotkey-tabs [aria-selected=true]')).toHaveText('help');
  await page.locator('.hotkey-close').click();
  await expect(page.locator('.hotkey-card')).toHaveCount(0);
});
