// cultivatePress.selfcheck.mjs — the CULTIVATE chip press performs the dry-run (#2488).
//
// The defect (stress session 2026-11-24, A10): breed a child, press the record's
// CULTIVATE chip — the chip goes pressed, the dry-run panel opens at 'not cultivated
// yet', and nothing ever advances it: no reads, indefinitely, with no explanation.
// The session stood PERF PAUSED at the time, so the stall read as loop starvation.
//
// The mechanism, proven against the tree (and in the built app, both loop states):
// nothing about the dry-run rides the loop at all. The reads are a synchronous pure
// derivation (cultivate.model's cultivationNote) written through the store door
// (cultivateCreature); the sketch plays on the miniature's own rAF clock. But the
// chip press only toggled the panel open — the derivation was bound exclusively to
// a second, identically labelled press inside the panel, and the panel's standing
// text never said so. The stall reproduces identically with the loop running, and
// the panel's own press lands the note instantly while PERF PAUSED stands: the
// pause was coincidence, the un-wired press was the defect.
//
// The fix: the chip press performs the dry-run for an uncultivated record as it
// opens the panel (WetLab derives the note the panel's own way — same record, same
// body asset, same project seed — and writes it through the same door). A standing
// note is never silently re-run; re-cultivation stays the panel's explicit press.
// And the panel's uncultivated line names that press, so the state can never again
// sit silent about what it is waiting for (the A7/#2485 discipline).
//
// #2541: the browser group's seed assertion originally baselined before.seed
// from the live scene, then navigated and pressed — a window seconds wide in
// which the project seed lawfully moves (layout builds stamp their build
// seed, bumpSeed re-rolls it, DAVIS evolve and phrase wrap advance it). A
// roll inside the window failed the assertion with the panel behaving
// correctly (PR #2540's CI: note seed 2451053944 vs sampled 1391772584). The
// group now takes the seed sample and the press in ONE synchronous page
// turn — no mover can run inside a single evaluate — so the baseline is the
// seed current at the press: the invariant's own terms, at full strength
// (the #2537/#2538 lesson — never baseline a standing frame against a
// moving scene).
//
//   A source    the press wiring in WetLab.jsx + the honest line in
//               CreatureCultivate.jsx (runs everywhere).
//   B browser   (skipped when no Playwright browser is present) the BUILT app:
//               parents banked and a child bred through the store's own actions,
//               the WetLab driven by DOM presses — ONE chip press must land the
//               note and open the panel on the reads, with the loop running and
//               again in the filed PERF PAUSED fold (running false, slowRender
//               true); reopening the panel on a cultivated record must not
//               silently re-run the dry-run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let n = 0;
const ok = async (name, fn) => {
  await fn();
  n++;
  console.log(`  [ok] ${name}`);
};

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---- A: source pins
{
  const wet = readFileSync(path.join(APP, 'src', 'panels', 'WetLab.jsx'), 'utf8');
  const panel = readFileSync(path.join(APP, 'src', 'components', 'CreatureCultivate.jsx'), 'utf8');
  await ok('the lab derives the note with the panel’s own model and writes through the store door', () => {
    assert.ok(
      wet.includes("import { cultivationNote } from '../components/cultivate.model.mjs';"),
      'WetLab must import cultivationNote',
    );
    assert.ok(
      wet.includes('const cultivateCreature = useStore((s) => s.cultivateCreature);'),
      'WetLab must select the cultivateCreature door',
    );
  });
  await ok('the CULTIVATE chip press performs the dry-run for an uncultivated record as it opens the panel', () => {
    const at = wet.indexOf('data-testid="record-cultivate"');
    assert.ok(at >= 0, 'record-cultivate chip located');
    const handler = wet.slice(at, at + 2400);
    assert.ok(
      handler.includes('if (!cultivateOpen && !selRecord.cultivated) {'),
      'the write must be gated on opening an uncultivated record (a standing note is never silently re-run)',
    );
    assert.ok(
      handler.includes('cultivateCreature(selRecord.id, cultivationNote(selRecord, selBodyAsset, seed));'),
      'the press must write the panel’s own derivation through the door',
    );
    assert.ok(handler.includes('setCultivateOpen((cur) => !cur);'), 'the press still toggles the panel');
  });
  await ok('the panel’s uncultivated line names the press it waits for', () => {
    assert.ok(
      panel.includes('not cultivated yet — press cultivate to run the dry-run'),
      'the uncultivated state must say what runs the dry-run',
    );
  });
  await ok('the panel’s own press remains the explicit re-run', () => {
    assert.ok(panel.includes('data-testid="cultivate-run"'), 'cultivate-run press present');
    assert.ok(
      panel.includes('cultivateCreature(record.id, cultivationNote(record, bodyAsset, seed))'),
      'the panel press still derives and writes the note',
    );
  });
}

// ---- B: browser (built-app, DOM-driven) section
let skipped = false;
let chromium = null;
try {
  ({ chromium } = await import('playwright'));
  const probe = await chromium
    .launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
    .catch((e) => {
      if (/Executable doesn't exist/.test(String(e?.message || e))) {
        skipped = true;
        return null;
      }
      throw e;
    });
  if (probe) await probe.close();
} catch (e) {
  if (/Executable doesn't exist/.test(String(e?.message || e))) skipped = true;
  else throw e;
}

if (!skipped) {
  execFileSync('npm', ['run', 'build'], { cwd: APP, stdio: 'pipe' });

  const DIST = path.join(APP, 'dist');
  const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
    '.wasm': 'application/wasm',
  };
  const server = http.createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.startsWith('/Kinetic_Curator/')) p = p.slice('/Kinetic_Curator'.length);
      if (p === '/' || p === '') p = '/index.html';
      let file = path.normalize(path.join(DIST, p));
      if (!file.startsWith(DIST)) {
        res.writeHead(403);
        res.end();
        return;
      }
      let data;
      try {
        data = await readFile(file);
      } catch {
        file = path.join(DIST, 'index.html');
        data = await readFile(file);
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('nf');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/Kinetic_Curator/`;

  const browser = await chromium.launch({
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('kc:first-run-seen', '1');
    window.__KC_EXPOSE_STORE = true;
    window.__KC_GOVERNOR_OFF = true; // the test holds its own stop for the paused variant
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.__kcStore && !!window.__KC_UI__', null, { timeout: 60000 });

  const store = () =>
    page.evaluate(() => {
      const s = window.__kcStore.getState();
      return { running: s.running, slowRender: s.slowRender, seed: s.seed };
    });
  const cultivatedOf = (id) =>
    page.evaluate((rid) => {
      const r = window.__kcStore.getState().creatureRecords.find((x) => x.id === rid);
      return r ? (r.cultivated ?? null) : null;
    }, id);
  // Presence of the panel's note line, polled in the DOM (Playwright's
  // visibility-based waitForSelector can starve on a saturated main thread
  // even when the element is rendered; presence is what the assertions read).
  const waitNoteShown = async (timeoutMs = 30000) => {
    const t0 = Date.now();
    for (;;) {
      const shown = await page.evaluate(() => !!document.querySelector('[data-testid="cultivate-note"]'));
      if (shown) return;
      if (Date.now() - t0 > timeoutMs) throw new Error('the panel never showed the cultivation note line');
      await page.waitForTimeout(250);
    }
  };
  const waitCultivated = async (id, timeoutMs = 20000) => {
    const t0 = Date.now();
    for (;;) {
      const note = await cultivatedOf(id);
      if (note) return note;
      if (Date.now() - t0 > timeoutMs)
        throw new Error(`one CULTIVATE press never cultivated ${id} — the panel is stalled at 'not cultivated yet'`);
      await page.waitForTimeout(250);
    }
  };
  // Pointer mechanics under sweep load are infrastructure, not assertion: a
  // plain Playwright click can starve on its stability check while the page's
  // main thread is saturated by a neighbouring suite, so presses go through a
  // helper that falls back to a DOM click (the same real click event on the
  // same button) — and every press's EFFECT is still polled and asserted
  // strictly below.
  const press = async (locator) => {
    await locator
      .first()
      .click({ timeout: 15000 })
      .catch(async () => {
        await locator.first().evaluate((el) => el.click());
      });
  };
  // Select a banked record on the creature stage: the chip's title names the
  // selected record, so it is the deterministic selection signal.
  const selectRecord = async (id) => {
    await press(page.locator('[data-testid="bank-tile"]', { hasText: id }));
    await page.waitForFunction(
      (rid) => {
        const chip = document.querySelector('[data-testid="record-cultivate"]');
        return !!chip && (chip.getAttribute('title') || '').includes(rid);
      },
      id,
      { timeout: 20000 },
    );
  };
  const chip = () => page.locator('[data-testid="record-cultivate"]');
  // The chip is a toggle, so a blind retry can double-fire it (a click that
  // timed out may still have dispatched). Presses toward a wanted panel state
  // are single-shot and state-verified instead: one click attempt, then poll
  // for the wanted state; a DOM click only if the state never arrived, then
  // poll again. The assertions on the note itself stay strict.
  const panelOpen = () => page.evaluate(() => !!document.querySelector('[data-testid="creature-cultivate"]'));
  const pressChipUntil = async (wantOpen) => {
    if ((await panelOpen()) === wantOpen) return;
    await chip()
      .click({ timeout: 10000 })
      .catch(() => {});
    for (let stage = 0; stage < 2; stage++) {
      const t0 = Date.now();
      while (Date.now() - t0 < 15000) {
        if ((await panelOpen()) === wantOpen) return;
        await page.waitForTimeout(250);
      }
      if (stage === 0)
        await page.evaluate(() => document.querySelector('[data-testid="record-cultivate"]')?.click()).catch(() => {});
    }
    throw new Error(`the cultivate panel never ${wantOpen ? 'opened' : 'closed'} on the chip press`);
  };
  // Opening the WetLab is likewise state-verified: poll for an opener (the
  // pool panel mounts on its dock tab; under load the tab press and the
  // panel's render can lag far behind the store's readiness), press it
  // through the load-tolerant helper, and require the dialog.
  const openWetLab = async () => {
    await page.keyboard.press('Escape'); // dismiss any boot overlay (the headless lane's standing move)
    await page.waitForSelector('#kc-tab-assets', { timeout: 30000 });
    const dialogOpen = () => page.evaluate(() => !!document.querySelector('[data-testid="wet-lab"]'));
    const openerReady = () =>
      page.evaluate(
        () =>
          !!document.querySelector('[data-testid="open-wetlab-empty"]') ||
          !!document.querySelector('[aria-label*="in the wet lab"]'),
      );
    for (let i = 0; i < 40 && !(await dialogOpen()) && !(await openerReady()); i++) {
      const selected = await page.evaluate(
        () => document.querySelector('#kc-tab-assets')?.getAttribute('aria-selected') === 'true',
      );
      if (!selected) await press(page.locator('#kc-tab-assets'));
      await page.waitForTimeout(500);
    }
    if (!(await dialogOpen())) {
      const empty = page.locator('[data-testid="open-wetlab-empty"]');
      if ((await empty.count()) > 0) await press(empty);
      else await press(page.locator('[aria-label^="Open "][aria-label*="in the wet lab"]'));
    }
    await page.waitForSelector('[data-testid="wet-lab"]', { timeout: 45000 });
  };

  try {
    // Bank three parents and breed a child through the store's own actions —
    // the filed repro's subject is a bred child.
    const seeded = await page.evaluate(() => {
      const S = window.__kcStore.getState();
      const pts = [
        { x: 50, y: 8, role: 'H' },
        { x: 10, y: 60, role: 'L' },
        { x: 90, y: 60, role: 'L' },
      ];
      S.assembleCreature('org_blob_01', pts);
      S.assembleCreature('org_pod_02', pts);
      S.assembleCreature('org_leaf_02', pts);
      const ids = window.__kcStore.getState().creatureRecords.map((r) => r.id);
      S.breedCreature(ids.map((id) => ({ kind: 'creature', id })));
      const st = window.__kcStore.getState();
      return { parents: ids, child: st.creatureBreedNote && st.creatureBreedNote.id };
    });
    assert.ok(seeded.child, 'the bred child banked');
    const childId = seeded.child;
    const parentId = seeded.parents[0];

    // Open the WetLab dialog from the asset pool (state-verified navigation;
    // every assertion after this stays strict).
    await openWetLab();

    await ok(
      '(browser) with the loop running, one CULTIVATE press cultivates the bred child and opens on the reads',
      async () => {
        // The sandbox's software GL can trip the perf watchdog during boot; Space
        // is the standing resume (A3), so hold the variant's precondition — the
        // loop genuinely running — rather than assuming the boot left it so.
        let before = await store();
        for (let i = 0; i < 20 && !before.running; i++) {
          await page.keyboard.press('Space');
          await page.waitForTimeout(500);
          before = await store();
        }
        assert.equal(before.running, true, 'variant precondition: the loop is running');
        await selectRecord(childId);
        assert.equal(await cultivatedOf(childId), null, 'the child starts uncultivated');
        // #2541: sample the seed and press in ONE synchronous page turn.
        // The project seed is a live value while the loop runs — layout
        // builds stamp their build seed over it (layoutSlice), bumpSeed
        // XOR-re-rolls it, DAVIS evolve and phrase wrap advance it — so a
        // sample taken before the press can be stale by the time the note
        // is stamped, and the assertion fails with the panel behaving
        // correctly. Inside a single evaluate no other script can run, so
        // the seed read here IS the seed current at the press: the
        // invariant's own baseline, at full strength. The DOM click is
        // this pin's own established press fallback (the same real click
        // event on the same button); the press's effects are still polled
        // and asserted strictly below.
        const seedAtPress = await page.evaluate(() => {
          const seed = window.__kcStore.getState().seed;
          document.querySelector('[data-testid="record-cultivate"]')?.click();
          return seed;
        });
        // The pressed state renders a beat behind the press; converge on
        // the read (the #2538 discipline) instead of sampling it once.
        {
          const t0 = Date.now();
          let pressed = await chip().getAttribute('aria-pressed');
          while (pressed !== 'true' && Date.now() - t0 < 15000) {
            await page.waitForTimeout(250);
            pressed = await chip().getAttribute('aria-pressed');
          }
          assert.equal(
            pressed,
            'true',
            `the chip stands pressed (the filed observation) — aria-pressed read ${pressed}`,
          );
        }
        const note = await waitCultivated(childId);
        assert.equal(
          note.seed,
          seedAtPress,
          `the note is stamped with the project seed current at the press — the panel’s own derivation (note seed ${note.seed}, seed at press ${seedAtPress})`,
        );
        await waitNoteShown();
        const text = await page.locator('[data-testid="creature-cultivate"]').innerText();
        assert.ok(!text.includes('not cultivated yet'), 'the panel opens on the reads, not the waiting line');
      },
    );

    await ok('(browser) reopening the panel on a cultivated record does not silently re-run the dry-run', async () => {
      const standing = JSON.stringify(await cultivatedOf(childId));
      await pressChipUntil(false); // close
      await pressChipUntil(true); // reopen
      await waitNoteShown();
      assert.equal(
        JSON.stringify(await cultivatedOf(childId)),
        standing,
        'the standing note is untouched by reopening',
      );
      await pressChipUntil(false); // close again for the next variant
    });

    await ok('(browser) in the filed PERF PAUSED fold, one CULTIVATE press still cultivates', async () => {
      await page.evaluate(() => window.__kcStore.setState({ running: false, slowRender: true }));
      await page.waitForTimeout(400);
      const held = await store();
      assert.equal(held.running, false, 'variant precondition: running false');
      assert.equal(held.slowRender, true, 'variant precondition: the governor froze the loop');
      await selectRecord(parentId);
      assert.equal(await cultivatedOf(parentId), null, 'the parent starts uncultivated');
      await pressChipUntil(true);
      const note = await waitCultivated(parentId);
      assert.ok(note, 'the note landed while PERF PAUSED stood');
      const after = await store();
      assert.equal(after.running, false, 'the loop is still stopped — the dry-run never needed it');
      assert.equal(after.slowRender, true, 'the governor fold still stands');
    });

    await ok('the whole walk produced no page errors', () => {
      assert.deepEqual(pageErrors, []);
    });
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(
  skipped
    ? `cultivatePress.selfcheck: ok (${n} groups, browser skipped)`
    : `cultivatePress.selfcheck: ok (${n} groups)`,
);
