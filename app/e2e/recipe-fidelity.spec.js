// #2325 (R5, audit F8) — the fidelity proof. The older roundtrip spec compares the footer seed, which a link that
// drops the whole scene would still pass. This one dresses a scene (light, world, a kineme, a construct, palette
// overrides, a non-default asset set), copies the link, opens it in a NEW BROWSER CONTEXT (no shared storage, nothing
// carried but the link) and asserts the receiver stands on the same stage:
//   1. the link's frame-0 hash `f` equals the receiver's frame-0 hash, and the receiver shows no
//      "Scene differs from sender's build" notice;
//   2. a second fresh context on the same link lands on the same hash.
// NOT here: a downscaled canvas checksum (#2325 asked for one). The live loop animates and, in headless software GL,
// paces unevenly: the same link photographed in two contexts differed by 4..70 /255 on a 2x2 mean-colour grid, and the
// sender's own canvas did not repaint after a scene edit inside the test window. A pixel gate that flaky is worse
// than none, so the exact frame-0 hash is the gate and the canvas checksum is left for a still-render path.
// Deliberately dropping a carried scene field from `x` (recipeSceneKeys.pickSceneBlock) fails (1); the PR shows it.
import { test, expect } from '@playwright/test';
import { assembleConstruct, constructTileId } from '../src/engine/constructAssembler.js';
import { constructRule } from '../src/engine/constructRules.js';
import { ASSETS } from '../src/data/assets/index.js';

const byId = new Map(ASSETS.map((a) => [a.id, a]));
const RECORD = assembleConstruct({ ...constructRule('bauhaus', (id) => byId.get(id)), seed: 20251117 });

const init = () => {
  window.__KC_EXPOSE_STORE = true;
  try {
    localStorage.setItem('kc:first-run-seen', '1');
  } catch {
    /* ignore */
  }
};

async function boot(page, url) {
  await page.addInitScript(init);
  await page.goto(url);
  await expect(page.locator('.app')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.panel-canvas .meter-pill', { hasText: /NODES/i }).first()).toContainText(/[1-9]/, {
    timeout: 30_000,
  });
}

test('a dressed scene copied as a link opens in a NEW browser context on the same frame 0', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxA = await browser.newContext();
  await ctxA.grantPermissions(['clipboard-read', 'clipboard-write']);
  const a = await ctxA.newPage();
  await boot(a, '/?boot=factory');

  // Dress the stage: every one of these is scene, none of it is seed/palette/layout.
  const dressed = await a.evaluate(
    ({ record, tile }) => {
      const st = window.__kcStore.getState();
      const enabled = { ...(st.enabledAssets || {}), org_petal_01: true, org_petal_02: true, [tile]: true };
      // One applyScene, the same door a recipe link uses: the loop sees it as an ordinary scene edit.
      st.applyScene({
        light: { azimuth: 2.1, elevation: 0.55, strength: 0.9 },
        world: { chapter: 'engraving', ground: '#10161c', ink: '#e6dcc4', boilFps: 8, finish: { grain: 0.4 } },
        paletteOverrides: { bg: '#102030' },
        assetKineme: { org_petal_01: 'rock' },
        constructRecords: [record],
        enabledAssets: enabled,
      });
      const s = window.__kcStore.getState();
      return {
        light: !!s.light,
        construct: (s.constructRecords || []).length,
        kineme: !!(s.assetKineme || {})['org_petal_01'],
      };
    },
    { record: RECORD, tile: constructTileId(RECORD.id) },
  );
  expect(dressed).toEqual({ light: true, construct: 1, kineme: true });
  await a.waitForTimeout(1000);

  const hashA = await a.evaluate(() => window.__kcFrame0Hash());
  expect(hashA).toMatch(/^[0-9a-f]{16}$/);

  await a.getByRole('tab', { name: /pipeline|output/i }).click();
  await expect(a.locator('.panel-output')).toBeVisible();
  await a.getByRole('button', { name: /copy link/i }).click();
  await expect
    .poll(() => a.evaluate(() => navigator.clipboard.readText()), { timeout: 10_000 })
    .toMatch(/#r=kc-r\/3\.[A-Za-z0-9_-]+$/);
  const link = await a.evaluate(() => navigator.clipboard.readText());

  // A NEW context: no localStorage, no sessionStorage, no autosave. Only the link.
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await boot(b, link);
  await b.waitForTimeout(4000);

  const hashB = await b.evaluate(() => window.__kcFrame0Hash());
  expect(hashB, 'the receiver stands on the sender’s frame 0').toBe(hashA);
  await expect(b.locator('body')).not.toContainText("Scene differs from sender's build");

  const sceneB = await b.evaluate(() => {
    const s = window.__kcStore.getState();
    return { light: !!s.light, construct: (s.constructRecords || []).length, world: s.world && s.world.chapter };
  });
  expect(sceneB).toEqual({ light: true, construct: 1, world: 'engraving' });

  // A SECOND fresh context on the same link lands on the same frame 0 too: the link is a deterministic recipe.
  const ctxC = await browser.newContext();
  const c = await ctxC.newPage();
  await boot(c, link);
  await c.waitForTimeout(2000);
  expect(await c.evaluate(() => window.__kcFrame0Hash())).toBe(hashA);

  await ctxA.close();
  await ctxB.close();
  await ctxC.close();
});
