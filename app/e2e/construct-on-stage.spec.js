// #2337 — a construct the artist banked can stand on the STAGE. Spec: creature-paint-drive §1.9.
// The pool the live loop hands the resolver and the baker now carries a tile for every banked construct, drawn from
// its record. This drives the running instrument: bank a construct and read the pool the live loop itself hands the
// resolver and baker (`window.__kcStagePoolIds`): the tile is there, drawn from the record, and nothing was saved.
// (An earlier cut watched the NODES pill; it stayed lit with the stage change reverted, so it proved nothing.)
import { test, expect } from '@playwright/test';
import { assembleConstruct, constructTileId } from '../src/engine/constructAssembler.js';
import { constructRule, CONSTRUCT_STYLE_IDS } from '../src/engine/constructRules.js';
import { ASSETS } from '../src/data/assets/index.js';

const byId = new Map(ASSETS.map((a) => [a.id, a]));
const rule = constructRule(CONSTRUCT_STYLE_IDS[0], (id) => byId.get(id) || null, null);
const RECORD = assembleConstruct({ ...rule, vocabulary: rule.vocabulary.slice(0, 2), seed: 0x2337beef });

test('a banked construct, enabled alone, is placed on the stage', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    window.__KC_EXPOSE_STORE = true;
    try {
      localStorage.setItem('kc:first-run-seen', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto('/?boot=factory');
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  const nodes = page.locator('.panel-canvas .meter-pill', { hasText: /NODES/i }).first();
  await expect(nodes).toContainText(/[1-9]/, { timeout: 30_000 });

  // `window.__kcStagePoolIds` is the pool the running live loop hands its resolver and baker (test hook, inert in prod).
  const tile = constructTileId(RECORD.id);
  const poolIds = () => page.evaluate(() => window.__kcStagePoolIds());
  expect(await poolIds(), 'nothing banked: no construct tile on the stage').not.toContain(tile);

  const state = await page.evaluate(
    ({ record, tileId }) => {
      const st = window.__kcStore.getState();
      st.bankConstruct(record);
      st.setEnabledAssets({ [tileId]: true });
      const s = window.__kcStore.getState();
      return { banked: (s.constructRecords || []).length, enabled: Object.keys(s.enabledAssets || {}) };
    },
    { record: RECORD, tileId: tile },
  );
  expect(state).toEqual({ banked: 1, enabled: [tile] });
  expect(await poolIds(), 'banked: the stage pool carries its tile').toContain(tile);
  // and the stage keeps drawing with only that tile enabled
  await expect(nodes).toContainText(/[1-9]/, { timeout: 20_000 });

  // ...and nothing about it was saved: the overlay holds no construct tile, the project keeps the record.
  const saved = await page.evaluate((tileId) => {
    const s = window.__kcStore.getState();
    return {
      inOverlay: (s.customAssets || []).some((a) => a && a.id === tileId),
      records: (s.constructRecords || []).map((r) => r.id),
    };
  }, tile);
  expect(saved).toEqual({ inOverlay: false, records: [RECORD.id] });
});
