// node qa/review.mjs <pr-number> [--no-qa] [--headed]
//   npm run review -- 682
//
// One-command PR review cockpit. Resolves the PR, checks CI, puts the PR's head
// branch in a sibling worktree (../kc-<n>-review), runs the selfcheck and the QA
// scenarios against it, pulls the "Review this" checklist out of the PR body,
// and writes ONE self-contained HTML page (app/qa-report/review-<n>.html) with
// everything Matt needs to review: CI status, selfcheck, checklist, screenshots,
// localhost URL. Then opens it.
//
// Flags: --no-qa skips the browser scenarios (CI + selfcheck + checklist still
// run); --headed passes through to the QA harness so you can watch the browser.
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Pull the checklist items out of the `## Review this` section of a PR body.
 * Accepts `- [ ]` / `- [x]` checkboxes, plain `-` bullets, and numbered lists. */
export function extractChecklist(body) {
  const items = [];
  let inSection = false;
  for (const line of String(body || '').split('\n')) {
    if (/^##\s+review this/i.test(line)) { inSection = true; continue; }
    if (inSection && /^##\s+/.test(line)) break;
    if (!inSection) continue;
    let m = line.match(/^\s*-\s*\[( |x|X)\]\s*(.+?)\s*$/);
    if (m) { items.push({ text: m[2], checked: m[1].toLowerCase() === 'x' }); continue; }
    m = line.match(/^\s*(?:-\s*|\d+[.)]\s+)(.+?)\s*$/);
    if (m && m[1]) items.push({ text: m[1], checked: false });
  }
  return items;
}

/** Build the single self-contained review page. Screenshots arrive as {caption,b64}. */
export function buildReviewHtml(d) {
  const n = d.n;
  const checks = d.checklist.map((c, i) =>
    `<label class="check"><input type="checkbox" data-i="${i}"${c.checked ? ' checked' : ''}><span>${esc(c.text)}</span></label>`).join('\n');
  const shots = d.shots.map((s) =>
    `<figure><figcaption>${esc(s.caption)}</figcaption><img src="data:image/png;base64,${s.b64}" alt="${esc(s.caption)}" loading="lazy"></figure>`).join('\n');
  const badge = (ok, t, f) => `<span class="badge ${ok ? '' : 'bad'}">${ok ? t : f}</span>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Review PR #${esc(n)} — ${esc(d.title)}</title>
<style>
:root{color-scheme:dark;--bg:#0d0d0d;--fg:#e8e8e0;--ok:#00c26e;--bad:#ff2d6f;--warn:#ffb020;--line:#2a2a2a}
body{background:var(--bg);color:var(--fg);font:14px/1.55 ui-monospace,Menlo,monospace;margin:0;padding:20px;max-width:1100px}
h1{font-size:19px;margin:0 0 4px}h2{font-size:15px;margin:26px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}
a{color:#6ed6e6}.meta{opacity:.75;margin:2px 0}.meta b{opacity:1}
.badge{font-weight:700;padding:1px 8px;border-radius:3px;background:var(--ok);color:#000;font-size:12px}
.badge.bad{background:var(--bad);color:#fff}.badge.warn{background:var(--warn);color:#000}
pre{background:#111;border:1px solid var(--line);padding:10px 12px;white-space:pre-wrap;font-size:12.5px;max-height:340px;overflow:auto}
.check{display:flex;gap:10px;align-items:flex-start;margin:9px 0;cursor:pointer}
.check input{width:17px;height:17px;margin-top:2px;accent-color:var(--ok);flex:none}
.check input:checked+span{opacity:.45;text-decoration:line-through}
figure{margin:14px 0}figcaption{opacity:.7;font-size:12px;margin-bottom:4px}
img{max-width:100%;border:1px solid var(--line)}
.note{border:1px dashed var(--warn);padding:10px 12px;margin:12px 0;font-size:13px}
code{background:#1a1a1a;padding:1px 6px;border-radius:3px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
</style>
<h1>PR #${esc(n)} — ${esc(d.title)}</h1>
<p class="meta"><a href="${esc(d.url)}">${esc(d.url)}</a> ${d.isDraft ? '<span class="badge warn">DRAFT</span>' : ''}</p>
<p class="meta">branch <code>${esc(d.branch)}</code> · worktree <code>${esc(d.worktree)}</code> · commit <code>${esc(d.commit)}</code></p>
<p class="meta">localhost <a href="${esc(d.localhost)}">${esc(d.localhost)}</a></p>

<h2>CI ${badge(d.ciPass, 'PASS', 'FAIL')}</h2>
<pre>${esc(d.ciRaw.trim() || '(no checks reported)')}</pre>

<h2>Selfcheck ${badge(d.selfcheck.pass, 'PASS', 'FAIL')}</h2>
<p class="meta">${esc(d.selfcheck.summary)}</p>
<pre>${esc(d.selfcheck.tail)}</pre>

<h2>Review this <span class="meta">(${d.checklist.length} items — ticks save in this browser)</span></h2>
${checks || '<p class="meta">No "Review this" checklist in the PR body.</p>'}

<h2>QA scenarios ${d.qa.ran ? badge(d.qa.pass, 'PASS', 'FAIL') : '<span class="badge warn">SKIPPED</span>'}</h2>
${d.qa.ran
  ? `<p class="meta">${d.qa.shotCount} screenshot(s) · full harness report: <code>${esc(d.qa.reportPath)}</code></p>${shots || '<p class="meta">No screenshots captured.</p>'}`
  : '<p class="meta">Browser scenarios skipped (--no-qa).</p>'}
${d.degraded ? `<div class="note">⚠ QA capture degraded in this environment: ${esc(d.degraded)}</div>` : ''}

<script>
(function(){
  const KEY = 'kc-review-${esc(n)}';
  const boxes = Array.from(document.querySelectorAll('.check input'));
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  boxes.forEach((b) => {
    const i = b.getAttribute('data-i');
    if (saved[i] !== undefined) b.checked = !!saved[i];
    b.addEventListener('change', () => {
      saved[i] = b.checked;
      try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {}
    });
  });
})();
</script>
</html>`;
}

// ---------- orchestration (not imported by the selfcheck) ----------

async function ghJson(args) {
  const { stdout } = await execFileAsync('gh', args, { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function ghText(args) {
  try {
    const { stdout } = await execFileAsync('gh', args, { maxBuffer: 64 * 1024 * 1024 });
    return { text: stdout, failed: false };
  } catch (e) {
    return { text: e.stdout || e.message, failed: true };
  }
}

/** Run a command streaming to the terminal and teeing to a log file. Resolves exit code. */
function runLogged(cmd, args, cwd, logFile, env = process.env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    const chunks = [];
    child.stdout.on('data', (d) => { chunks.push(d); process.stdout.write(d); });
    child.stderr.on('data', (d) => { chunks.push(d); process.stderr.write(d); });
    child.on('error', (e) => { console.error(`\n! failed to start ${cmd}: ${e.message}`); resolve(1); });
    child.on('close', (code) => {
      try { writeFileSync(logFile, Buffer.concat(chunks)); } catch { /* ignore */ }
      resolve(code ?? 1);
    });
  });
}

const up = async (url) => { try { return (await fetch(url)).ok; } catch { return false; } };

/** Same shape as the QA harness's ensureServer, but serves the given app dir on a free port. */
async function startServer(appDir) {
  let port = 5199;
  let url = '';
  for (; port < 5250; port++) {
    url = `http://127.0.0.1:${port}/Kinetic_Curator/`;
    if (!(await up(url))) break;
  }
  if (port >= 5250) throw new Error('no free port in 5199-5249');
  const child = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: appDir, stdio: 'ignore', shell: process.platform === 'win32' });
  for (let i = 0; i < 60 && !(await up(url)); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up(url))) { child.kill(); throw new Error('dev server did not come up on ' + url); }
  return { url, stop: () => child.kill() };
}

function collectShots(reportDir) {
  const out = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.png$/i.test(f.name)) out.push(p);
    }
  };
  if (existsSync(reportDir)) walk(reportDir);
  return out.sort().map((p) => ({ caption: relative(reportDir, p), b64: readFileSync(p).toString('base64') }));
}

/** Find an existing worktree already on this branch (builders leave theirs around). */
async function findWorktreeForBranch(repoRoot, branch) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain']);
    let cur = null;
    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) cur = line.slice('worktree '.length).trim();
      else if (line.startsWith('branch ') && cur && line.slice('branch '.length).trim() === `refs/heads/${branch}`) return cur;
      else if (line === '') cur = null;
    }
  } catch { /* ignore */ }
  return null;
}

/** Fast-forward a worktree to the latest PR head; warns and continues on failure. */
async function syncWorktree(wtPath, branch) {
  try {
    await execFileAsync('git', ['-C', wtPath, 'fetch', 'origin', branch]);
    await execFileAsync('git', ['-C', wtPath, 'pull', '--ff-only', 'origin', branch]);
    console.log('  fast-forwarded to latest PR head');
  } catch { console.log('  (could not fast-forward; reviewing the checked-out commit)'); }
}

function openBrowser(file) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'linux' ? 'xdg-open' : null;
  if (!opener) { console.log(`open this file: ${file}`); return; }
  const child = spawn(opener, [file], { stdio: 'ignore', detached: true });
  child.on('error', () => console.log(`could not auto-open; file is at ${file}`));
  child.unref();
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const pr = args.find((a) => !a.startsWith('--'));
  if (!pr || !/^\d+$/.test(pr)) {
    console.error('usage: npm run review -- <pr-number> [--no-qa] [--headed]');
    process.exit(2);
  }
  const t0 = Date.now();

  console.log(`▶ resolving PR #${pr} …`);
  let info;
  try {
    info = await ghJson(['pr', 'view', pr, '--json', 'number,title,body,headRefName,url,isDraft']);
  } catch (e) {
    console.error(`! could not resolve PR #${pr}: ${e.message}`);
    process.exit(2);
  }
  const branch = info.headRefName;
  console.log(`  ${info.title}\n  branch: ${branch}${info.isDraft ? ' (draft)' : ''}`);

  console.log('▶ CI status …');
  const ci = await ghText(['pr', 'checks', pr]);
  const ciPass = !ci.failed && !/fail/i.test(ci.text);
  console.log(ci.text.trim() || '(no checks reported)');

  const repoRoot = (await execFileAsync('git', ['-C', APP, 'rev-parse', '--show-toplevel'])).stdout.trim();

  let wtPath = await findWorktreeForBranch(repoRoot, branch);
  if (wtPath) {
    console.log(`▶ reusing worktree ${wtPath} (already on ${branch})`);
    await syncWorktree(wtPath, branch);
  } else {
    wtPath = join(dirname(repoRoot), `kc-${pr}-review`);
    const isWt = existsSync(join(wtPath, '.git'));
    if (isWt) {
      const cur = (await execFileAsync('git', ['-C', wtPath, 'rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
      if (cur !== branch) {
        console.error(`! ${wtPath} is on branch ${cur}, not ${branch} — move or remove it first.`);
        process.exit(2);
      }
      console.log(`▶ reusing worktree ${wtPath}`);
      await syncWorktree(wtPath, branch);
    } else {
      if (existsSync(wtPath)) {
        console.error(`! ${wtPath} exists but is not a git worktree — move or remove it first.`);
        process.exit(2);
      }
      console.log(`▶ creating worktree ${wtPath} on ${branch} …`);
      await execFileAsync('git', ['-C', repoRoot, 'fetch', 'origin', branch]);
      await execFileAsync('git', ['-C', repoRoot, 'worktree', 'add', wtPath, branch]);
    }
  }
  const commit = (await execFileAsync('git', ['-C', wtPath, 'rev-parse', '--short', 'HEAD'])).stdout.trim();
  const wtApp = join(wtPath, 'app');

  if (!existsSync(join(wtApp, 'node_modules'))) {
    console.log('▶ npm install (first time in this worktree) …');
    const code = await runLogged('npm', ['install', '--no-audit', '--no-fund'], wtApp, join(APP, 'qa-report', `review-${pr}-install.log`));
    if (code !== 0) { console.error('! npm install failed'); process.exit(1); }
  } else {
    console.log('▶ node_modules present, skipping npm install');
  }

  mkdirSync(join(APP, 'qa-report'), { recursive: true });

  console.log('▶ npm run selfcheck in the worktree …');
  const scLog = join(APP, 'qa-report', `review-${pr}-selfcheck.log`);
  const scStart = Date.now();
  const scCode = await runLogged('npm', ['run', 'selfcheck'], wtApp, scLog);
  const scSecs = Math.round((Date.now() - scStart) / 1000);
  const scText = existsSync(scLog) ? readFileSync(scLog, 'utf8') : '';
  const suitesOk = (scText.match(/: OK$/gm) || []).length;
  const scTail = scText.split('\n').slice(-25).join('\n').trim() || '(no output)';
  const selfcheck = {
    pass: scCode === 0,
    summary: `exit ${scCode} · ${suitesOk} suite(s) OK · ${scSecs}s · log: qa-report/review-${pr}-selfcheck.log`,
    tail: scTail,
  };
  console.log(selfcheck.pass ? '  selfcheck PASS' : '  selfcheck FAIL');

  let qa = { ran: false, pass: false, shotCount: 0, reportPath: '' };
  let shots = [];
  let degraded = '';
  let localhost = '';
  if (flags.has('--no-qa')) {
    console.log('▶ skipping browser scenarios (--no-qa)');
  } else {
    let server;
    try {
      console.log('▶ starting dev server for the worktree …');
      server = await startServer(wtApp);
      localhost = server.url;
      console.log(`  ${localhost}`);
      console.log('▶ running QA scenarios …');
      const qaArgs = ['qa/run.mjs'];
      if (flags.has('--headed')) qaArgs.push('--headed');
      const qaCode = await runLogged('node', qaArgs, wtApp,
        join(APP, 'qa-report', `review-${pr}-qa.log`),
        { ...process.env, QA_URL: server.url });
      qa = { ran: true, pass: qaCode === 0, shotCount: 0, reportPath: join(wtPath, 'app', 'qa-report', 'index.html') };
      shots = collectShots(join(wtApp, 'qa-report'));
      qa.shotCount = shots.length;
      console.log(qa.pass ? `  QA PASS (${shots.length} screenshots)` : `  QA FAIL (${shots.length} screenshots)`);
    } catch (e) {
      degraded = e.message;
      console.log(`  ! QA degraded: ${e.message}`);
    } finally {
      if (server) server.stop();
    }
  }

  const checklist = extractChecklist(info.body);
  console.log(`▶ checklist: ${checklist.length} item(s)`);

  const html = buildReviewHtml({
    n: pr, title: info.title, url: info.url, isDraft: info.isDraft,
    branch, worktree: wtPath, commit, localhost: localhost || '(server stopped — rerun to review live)',
    ciRaw: ci.text, ciPass, selfcheck, checklist, qa, shots, degraded,
  });
  const outFile = join(APP, 'qa-report', `review-${pr}.html`);
  writeFileSync(outFile, html);
  console.log(`\nreview page: ${outFile}  (${Math.round((Date.now() - t0) / 1000)}s total)`);
  openBrowser(outFile);
}

const invokedAsMain = (() => {
  try { return process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url; }
  catch { return false; }
})();
if (invokedAsMain) {
  try { await main(); }
  catch (e) { console.error(`! ${e.message || e}`); process.exit(1); }
}
