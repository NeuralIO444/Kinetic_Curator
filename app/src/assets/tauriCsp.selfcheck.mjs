// node src/assets/tauriCsp.selfcheck.mjs
// #1707 part 3 — the desktop shell ships a Content-Security-Policy. The load path already refuses what import refuses
// (#1754); this is the backstop for markup that slips past a filter: with no 'unsafe-inline' in script-src, an inline
// handler or a javascript: URL in rendered SVG cannot run, so it can never reach Tauri's fs / write_batch_frame. Pins
// the policy's load-bearing directives so a later edit cannot quietly loosen them. (Verified in a browser against the
// built app on 2026-10-27: zero violations through boot, KIN taps, START and LOOKS; both #1707 payload shapes blocked.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const conf = JSON.parse(readFileSync(new URL('../../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
const csp = conf?.tauri?.security?.csp;
assert.equal(typeof csp, 'string', 'tauri.conf.json sets a CSP (was null)');
const dirs = Object.fromEntries(
  csp
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .filter((d) => d[0])
    .map(([k, ...v]) => [k, v]),
);
assert.ok(dirs['default-src']?.includes("'self'"), "default-src 'self'");
const script = dirs['script-src'];
assert.ok(script, 'script-src is explicit');
for (const bad of ["'unsafe-inline'", "'unsafe-eval'", '*', 'data:', 'blob:', 'http:', 'https:'])
  assert.ok(!script.includes(bad), `script-src must not allow ${bad}`);
assert.ok(script.includes("'wasm-unsafe-eval'"), 'the kernel WASM still compiles');
assert.deepEqual(dirs['object-src'], ["'none'"], "object-src 'none'");
assert.deepEqual(dirs['frame-src'], ["'none'"], "frame-src 'none'");
assert.deepEqual(dirs['base-uri'], ["'self'"], "base-uri 'self'");
assert.ok(
  !(dirs['connect-src'] || []).some((s) => /^https?:\/\/(?!ipc\.localhost|asset\.localhost)/.test(s)),
  'no remote connect',
);

console.log('tauriCsp.selfcheck: ok (#1707 — script-src has no inline/eval; object/frame none)');
