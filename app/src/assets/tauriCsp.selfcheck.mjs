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
const parseDirs = (policy) =>
  Object.fromEntries(
    policy
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([k, ...v]) => [k, v]),
  );
const dirs = parseDirs(csp);
assert.ok(dirs['default-src']?.includes("'self'"), "default-src 'self'");
const script = dirs['script-src'];
assert.ok(script, 'script-src is explicit');
for (const bad of ["'unsafe-inline'", "'unsafe-eval'", '*', 'data:', 'blob:', 'http:', 'https:'])
  assert.ok(!script.includes(bad), `script-src must not allow ${bad}`);
assert.ok(script.includes("'wasm-unsafe-eval'"), 'the kernel WASM still compiles');
assert.deepEqual(dirs['object-src'], ["'none'"], "object-src 'none'");
assert.deepEqual(dirs['frame-src'], ["'none'"], "frame-src 'none'");
assert.deepEqual(dirs['base-uri'], ["'self'"], "base-uri 'self'");
// #1525 (Matt's ruling, 2026-11-10): connect-src carries exactly ONE http origin — http://127.0.0.1:11434,
// the MegaMind local-model link's Ollama loopback — in the release CSP and the dev CSP alike. The ruling's
// reasoning: MegaMind is useless in the desktop shell unless the shell may talk to the visitor's own Ollama,
// and 127.0.0.1 can only ever name that visitor's own machine — the allowance opens no remote host. It is an
// exact origin, not a pattern: no other http(s) source, no wildcard, no scheme-wide http:/https: token is
// permitted in connect-src, and the origin appears in no other directive.
const OLLAMA_ORIGIN = 'http://127.0.0.1:11434';
for (const [name, policy] of [
  ['csp', csp],
  ['devCsp', conf?.tauri?.security?.devCsp],
]) {
  assert.equal(typeof policy, 'string', `tauri.conf.json sets a ${name}`);
  const d = parseDirs(policy);
  const connect = d['connect-src'] || [];
  assert.ok(connect.includes(OLLAMA_ORIGIN), `${name}: connect-src carries the MegaMind Ollama origin`);
  for (const [dir, sources] of Object.entries(d))
    for (const s of sources)
      if (s === OLLAMA_ORIGIN) assert.equal(dir, 'connect-src', `${name}: the Ollama origin lives in connect-src only`);
  for (const s of connect) {
    assert.ok(
      s !== 'http:' && s !== 'https:' && s !== '*',
      `${name}: no scheme-wide or wildcard source in connect-src`,
    );
    if (/^https?:\/\//.test(s))
      assert.ok(
        s === OLLAMA_ORIGIN || /^https?:\/\/(ipc\.localhost|asset\.localhost)$/.test(s),
        `${name}: no http(s) connect beyond ipc/asset localhost and the one Ollama origin — saw ${s}`,
      );
  }
}

console.log(
  'tauriCsp.selfcheck: ok (#1707 — script-src has no inline/eval; object/frame none; #1525 — one Ollama origin in connect-src)',
);
