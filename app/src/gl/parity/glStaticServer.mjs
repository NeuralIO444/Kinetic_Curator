// glStaticServer.mjs — the file server the headless GL harnesses share (#1098).
//
// The harnesses load renderer.mjs in headless Chromium over plain HTTP, rooted at src/gl. The
// renderer imports the PATTERN engine (src/pattern, src/data, src/state, src/engine ...), which sit
// beside src/gl, so a request the gl folder cannot answer falls back to src/ (never outside it).
// Node only. Was three copies of the same handler (glDriver, debug.selfcheck, costTiers.measure).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MIME = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript' };

/** @param {string} glDir absolute path of src/gl @returns {(req, res) => Promise<void>} */
export function glStaticHandler(glDir) {
  const srcDir = path.join(glDir, '..');
  const send = (res, file, data) => {
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  };
  return async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = path.normalize(path.join(glDir, urlPath));
      if (!file.startsWith(glDir)) { res.writeHead(403); res.end(); return; }
      try { send(res, file, await readFile(file)); return; } catch { /* not under src/gl: try src/ */ }
      const alt = path.normalize(path.join(srcDir, urlPath));
      if (!alt.startsWith(srcDir)) { res.writeHead(403); res.end(); return; }
      send(res, alt, await readFile(alt));
    } catch {
      res.writeHead(404); res.end('nf');
    }
  };
}
