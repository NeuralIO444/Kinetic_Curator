/**
 * debug.selfcheck.mjs — GL debug harness integrity (#193). Node-only.
 *
 * Serves src/gl over HTTP, runs the in-page assertions
 * (src/gl/debug/selfcheck.page.mjs) in headless Chromium, and fails loudly
 * on any failed case. Registered in package.json `selfcheck`.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DEBUG_DIR = path.dirname(fileURLToPath(import.meta.url));
const GL_DIR = path.join(DEBUG_DIR, '..');
const MIME = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript' };

async function main() {
  // --sweep-only runs just the uniform-sweep section (npm run selfcheck:sweep).
  const sweepOnly = process.argv.includes('--sweep-only');
  const server = http.createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = path.normalize(path.join(GL_DIR, urlPath));
      if (!file.startsWith(GL_DIR)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end('nf');
    }
  });

  let browser = null;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
      browser = await chromium.launch();
    } catch (e) {
      // Same convention as parity.selfcheck.mjs: CI runners may not have the
      // Playwright browser installed (the lint job intentionally skips
      // `playwright install` to stay fast). The debug harness is still
      // exercised on dev machines and in e2e — skip here rather than failing
      // the whole selfcheck suite.
      if (/Executable doesn't exist/.test(String((e && e.message) || ''))) {
        console.log('[skip] debug.selfcheck: Playwright browser not installed in this environment');
        console.log('SWEEP TESTS SKIPPED: no headless Chromium — uniform-sweep property tests did not run');
        return;
      }
      throw e;
    }
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String((e && e.stack) || e)));
    await page.goto(`http://127.0.0.1:${port}/debug/selfcheck.html${sweepOnly ? '?only=sweep' : ''}`);
    await page.waitForFunction('window.__kcDebugDone === true', null, { timeout: 120000 });
    const result = await page.evaluate('window.__kcDebugResult');
    for (const line of result.lines || []) console.log(line);
    if (result.error) console.error(result.error);
    if (errors.length) console.error('page errors:\n' + errors.join('\n'));
    if (!result.ok) {
      console.error(`debug.selfcheck: FAIL (${(result.failures || []).join(', ')})`);
      process.exitCode = 1;
    } else {
      console.log(`debug.selfcheck: OK (${(result.lines || []).length} cases)`);
    }
  } finally {
    try { await browser?.close(); } catch { /* noop */ }
    server.close();
  }
}

await main();
