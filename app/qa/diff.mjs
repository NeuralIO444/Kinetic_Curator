// qa/diff.mjs — before/after visual diff for a PR.
//
// Captures the QA scenarios on the PR's base branch and on its head branch,
// then writes one page with each screenshot side by side, a before/after
// slider, and a pixel-diff heatmap. The pixel diff is computed client-side
// in the page's own script (canvas 2D) — no new npm dependencies.
//
//   npm run diff -- 682                          # all scenarios
//   npm run diff -- 682 --scenarios palette-import,wash-mode
//   npm run diff -- 682 --open                   # open the page when done
//   npm run diff -- 682 --no-install             # skip npm install in the scratch worktrees
//
// Scratch worktrees live next to this one: ../wt-diff-<n>-base and
// ../wt-diff-<n>-pr. The page lands in app/qa-report/diff-<n>.html
// (gitignored, like the rest of qa-report).
import { spawnSync, execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const QA = dirname(fileURLToPath(import.meta.url));
const APP = join(QA, '..');
const ROOT = join(APP, '..');
const REPORT_DIR = join(APP, 'qa-report');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Run a command, return { ok, stdout, stderr, code }. Never throws. */
function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return { ok: r.status === 0, stdout: r.stdout || '', stderr: r.stderr || '', code: r.status };
}

function fail(msg) { console.error(`diff: ${msg}`); process.exit(2); }

/** Make sure a scratch worktree exists on origin/<ref>; update it if it does. */
function ensureWorktree(pr, kind, ref) {
  const name = `wt-diff-${pr}-${kind}`;
  const path = join(ROOT, '..', name);
  const branch = `diff-${pr}-${kind}`;
  const git = (a) => sh('git', ['-C', path, ...a]);

  if (existsSync(join(path, '.git')) || existsSync(path)) {
    const cur = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
    if (cur !== branch) {
      console.log(`diff: ${name} is on '${cur}', rebuilding…`);
      sh('git', ['-C', ROOT, 'worktree', 'remove', '--force', path]);
    } else {
      git(['fetch', 'origin', '-q']);
      git(['reset', '--hard', '-q', `origin/${ref}`]);
      console.log(`diff: reusing ${name} @ ${git(['rev-parse', '--short', 'HEAD']).stdout.trim()}`);
      return path;
    }
  }
  console.log(`diff: creating ${name} on origin/${ref}…`);
  const r = sh('git', ['-C', ROOT, 'worktree', 'add', '-b', branch, path, `origin/${ref}`]);
  if (!r.ok) fail(`git worktree add failed:\n${r.stderr}`);
  return path;
}

function ensureInstalled(wtApp, skip) {
  if (skip || existsSync(join(wtApp, 'node_modules'))) return;
  console.log(`diff: npm install in ${wtApp}…`);
  const r = sh('npm', ['install', '--no-audit', '--no-fund'], { cwd: wtApp });
  if (!r.ok) fail(`npm install failed in ${wtApp}:\n${r.stderr.slice(-2000)}`);
}

/** Run the QA harness in a worktree; returns { statuses: Map(scenario -> PASS|FAIL) }. */
function runQA(wtApp, scenarios, label) {
  console.log(`diff: running QA scenarios on ${label}…`);
  const args = ['qa/run.mjs', ...scenarios];
  const r = spawnSync('node', args, { cwd: wtApp, encoding: 'utf8' });
  const statuses = new Map();
  for (const line of (r.stdout || '').split('\n')) {
    const m = line.match(/^▶\s+(\S+)\s+…\s+(PASS|FAIL)/);
    if (m) statuses.set(m[1], m[2]);
  }
  if (r.status !== 0 && statuses.size === 0) {
    console.error(r.stdout.slice(-3000));
    fail(`QA run failed on ${label} (exit ${r.status})`);
  }
  return { statuses };
}

/** { scenario -> [{ file, label }] } from a worktree's qa-report dir. */
function collectShots(wtApp) {
  const dir = join(wtApp, 'qa-report');
  const out = {};
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (!statSync(p).isDirectory() || e.startsWith('diff-')) continue;
    const shots = readdirSync(p)
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => ({ file: f, label: f.replace(/^\d+-/, '').replace(/\.png$/, '').replace(/-/g, ' ') }));
    if (shots.length) out[e] = shots;
  }
  return out;
}

function main() {
  const raw = process.argv.slice(2);
  const flags = new Set(raw.filter((a) => a.startsWith('--')));
  const positional = raw.filter((a) => !a.startsWith('--'));
  const pr = positional[0];
  if (!pr || !/^\d+$/.test(pr)) fail('usage: npm run diff -- <pr-number> [--scenarios a,b] [--open] [--no-install]');

  let scenarios = [];
  const sf = raw.find((a) => a.startsWith('--scenarios'));
  if (sf) {
    const v = sf.includes('=') ? sf.split('=').slice(1).join('=') : positional[1];
    scenarios = (v || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!scenarios.length) fail('--scenarios needs a comma-separated list');
  }

  const info = sh('gh', ['pr', 'view', pr, '--json', 'number,title,headRefName,baseRefName,url']);
  if (!info.ok) fail(`gh pr view ${pr} failed:\n${info.stderr}`);
  const { title, headRefName, baseRefName, url } = JSON.parse(info.stdout);
  console.log(`diff: PR #${pr} — ${title}\n      base: origin/${baseRefName}  head: origin/${headRefName}`);

  sh('git', ['-C', ROOT, 'fetch', 'origin', '-q']);
  const baseWt = ensureWorktree(pr, 'base', baseRefName);
  const prWt = ensureWorktree(pr, 'pr', headRefName);
  const noInstall = flags.has('--no-install');
  ensureInstalled(join(baseWt, 'app'), noInstall);
  ensureInstalled(join(prWt, 'app'), noInstall);

  const baseRes = runQA(join(baseWt, 'app'), scenarios, 'base');
  const prRes = runQA(join(prWt, 'app'), scenarios, 'PR branch');
  const baseShots = collectShots(join(baseWt, 'app'));
  const prShots = collectShots(join(prWt, 'app'));

  // Copy screenshots under this worktree's qa-report/diff-<n>/{base,pr}/<scenario>/
  const dest = join(REPORT_DIR, `diff-${pr}`);
  rmSync(dest, { recursive: true, force: true });
  const scenariosAll = [...new Set([...Object.keys(baseShots), ...Object.keys(prShots)])].sort();
  const pairs = [];
  let pid = 0;
  for (const scn of scenariosAll) {
    const b = Object.fromEntries((baseShots[scn] || []).map((s) => [s.file, s]));
    const q = Object.fromEntries((prShots[scn] || []).map((s) => [s.file, s]));
    for (const sdir of [['base', b, baseShots[scn]], ['pr', q, prShots[scn]]]) {
      const [side, , shots] = sdir;
      if (!shots) continue;
      const from = join(side === 'base' ? baseWt : prWt, 'app', 'qa-report', scn);
      cpSync(from, join(dest, side, scn), { recursive: true });
    }
    for (const file of [...new Set([...Object.keys(b), ...Object.keys(q)])].sort()) {
      pairs.push({
        id: `p${pid++}`,
        scenario: scn,
        label: (b[file] || q[file]).label,
        base: b[file] ? `diff-${pr}/base/${scn}/${file}` : null,
        pr: q[file] ? `diff-${pr}/pr/${scn}/${file}` : null,
      });
    }
  }

  const html = renderPage({ pr, title, url, baseRefName, headRefName, scenariosAll, baseRes, prRes, pairs });
  mkdirSync(REPORT_DIR, { recursive: true });
  const page = join(REPORT_DIR, `diff-${pr}.html`);
  writeFileSync(page, html);
  console.log(`\ndiff: ${pairs.length} screenshot pair(s) across ${scenariosAll.length} scenario(s)\npage: ${page}`);
  if (flags.has('--open')) {
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    execFile(opener, [page], (e) => { if (e) console.error(`diff: could not open (${e.message})`); });
  }
}

function renderPage({ pr, title, url, baseRefName, headRefName, scenariosAll, baseRes, prRes, pairs }) {
  const badge = (s) => s === 'PASS'
    ? '<span class="badge ok">PASS</span>'
    : s === 'FAIL' ? '<span class="badge bad">FAIL</span>' : '<span class="badge na">n/a</span>';
  const byScenario = scenariosAll.map((scn) => ({
    scn,
    baseStatus: baseRes.statuses.get(scn) || null,
    prStatus: prRes.statuses.get(scn) || null,
    pairs: pairs.filter((p) => p.scenario === scn),
  }));

  const sections = byScenario.map(({ scn, baseStatus, prStatus, pairs: ps }) => `
<section class="scn">
  <h2>${esc(scn)} <span class="run">base ${badge(baseStatus)}</span> <span class="run">PR ${badge(prStatus)}</span></h2>
  ${ps.length ? '' : '<p class="note">no screenshots captured on either side.</p>'}
  ${ps.map((p) => `
  <div class="pair" id="${p.id}">
    <h3>${esc(p.label)}</h3>
    ${!p.base || !p.pr ? `<p class="note">only on ${!p.base ? 'PR branch' : 'base'} — no pair to compare.</p>
      <figure><img src="${esc(p.base || p.pr)}" alt="${esc(p.label)}"></figure>` : `
    <div class="views" role="tablist">
      <button data-v="side" class="on">Side by side</button><button data-v="slider">Slider</button><button data-v="diff">Diff</button>
    </div>
    <div class="view side">
      <figure><figcaption>base <span class="ref">${esc(baseRefName)}</span></figcaption><img src="${esc(p.base)}"></figure>
      <figure><figcaption>PR <span class="ref">${esc(headRefName)}</span></figcaption><img src="${esc(p.pr)}"></figure>
    </div>
    <div class="view slider" hidden>
      <div class="slwrap"><img class="s-base" src="${esc(p.base)}"><img class="s-pr" src="${esc(p.pr)}"><div class="s-line"></div></div>
      <input type="range" min="0" max="100" value="50" aria-label="before/after position">
    </div>
    <div class="view diffv" hidden>
      <canvas></canvas>
      <p class="diffcap">computing…</p>
    </div>`}
  </div>`).join('\n')}
</section>`).join('\n');

  return `<!doctype html><html lang="en"><meta charset="utf-8">
<title>Before/after diff — PR #${esc(pr)}</title>
<style>
:root{color-scheme:dark;--bg:#0d0d0d;--fg:#e8e8e0;--ok:#00c26e;--bad:#ff2d6f;--hot:#ff2d6f;--line:#2a2a2a;--mut:#999}
body{background:var(--bg);color:var(--fg);font:14px/1.5 ui-monospace,Menlo,monospace;margin:0;padding:16px;max-width:1400px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:15px;margin:0 0 8px}h3{font-size:13px;margin:14px 0 6px;color:var(--mut);font-weight:400}
.meta{opacity:.7;margin:0 0 16px}.meta a{color:inherit}
.scn{border:1px solid var(--line);padding:12px 14px;margin:16px 0}
.badge{font-weight:700;padding:1px 6px;border-radius:3px;font-size:12px;background:#555;color:#fff}
.badge.ok{background:var(--ok);color:#000}.badge.bad{background:var(--bad);color:#fff}
.run{font-size:12px;font-weight:400;margin-left:8px;opacity:.9}
.note{opacity:.6;font-size:12px}
.pair{border-top:1px solid var(--line);padding-bottom:10px}
.views{margin:6px 0}.views button{background:#1c1c1c;color:var(--fg);border:1px solid var(--line);padding:4px 10px;margin-right:6px;cursor:pointer;font:inherit;font-size:12px;border-radius:3px}
.views button.on{background:#2e2e2e;border-color:#555}
.view[hidden]{display:none!important}
.view.side{display:flex;gap:12px;flex-wrap:wrap}.view.side figure{flex:1 1 0;min-width:280px;margin:0}
figure{margin:0}figcaption{opacity:.7;font-size:12px;margin-bottom:4px}.ref{opacity:.7}
img{max-width:100%;border:1px solid var(--line);display:block}
.slwrap{position:relative;display:inline-block;max-width:100%}.slwrap img{display:block;max-width:100%}
.slwrap .s-pr{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;clip-path:inset(0 50% 0 0)}
.s-line{position:absolute;top:0;bottom:0;width:2px;background:#fff;left:50%;pointer-events:none;box-shadow:0 0 4px #000}
.view.slider input{width:100%;max-width:640px;margin-top:8px}
.view.diffv canvas{max-width:100%;border:1px solid var(--line)}
.diffcap{font-size:12px;opacity:.8}
</style>
<h1>Before/after diff — PR <a href="${esc(url)}">#${esc(pr)}</a>: ${esc(title)}</h1>
<p class="meta">base <b>${esc(baseRefName)}</b> vs PR branch <b>${esc(headRefName)}</b> · ${new Date().toLocaleString()} · pixel diff threshold 16/255</p>
${sections}
<script>
const pairs = ${JSON.stringify(pairs.filter((p) => p.base && p.pr))};
const HOT = [255, 45, 111], TH = 16;
function load(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src;});}
document.querySelectorAll('.pair').forEach((el)=>{
  const btns=[...el.querySelectorAll('.views button')];
  const views={side:el.querySelector('.view.side'),slider:el.querySelector('.view.slider'),diffv:el.querySelector('.view.diffv')};
  if(!btns.length)return;
  btns.forEach((b)=>b.addEventListener('click',()=>{
    btns.forEach((x)=>x.classList.toggle('on',x===b));
    Object.entries(views).forEach(([k,v])=>{v.hidden=k!==b.dataset.v;});
    if(b.dataset.v==='diff')compute(el);
  }));
  const wrap=el.querySelector('.slwrap');
  if(wrap){
    const pr=wrap.querySelector('.s-pr'),line=wrap.querySelector('.s-line'),range=el.querySelector('input[type=range]');
    range.addEventListener('input',()=>{pr.style.clipPath='inset(0 '+(100-range.value)+'% 0 0)';line.style.left=range.value+'%';});
  }
});
const done=new Set();
async function compute(el){
  if(done.has(el.id))return;done.add(el.id);
  const p=pairs.find((x)=>x.id===el.id);if(!p)return;
  const cap=el.querySelector('.diffcap'),cv=el.querySelector('canvas');
  try{
    const [bi,qi]=await Promise.all([load(p.base),load(p.pr)]);
    const W=Math.max(bi.naturalWidth,qi.naturalWidth),H=Math.max(bi.naturalHeight,qi.naturalHeight);
    cv.width=W;cv.height=H;
    const bc=document.createElement('canvas'),qc=document.createElement('canvas');
    bc.width=qc.width=W;bc.height=qc.height=H;
    const bx=bc.getContext('2d',{willReadFrequently:true}),qx=qc.getContext('2d',{willReadFrequently:true});
    bx.drawImage(bi,0,0);qx.drawImage(qi,0,0);
    const bd=bx.getImageData(0,0,W,H).data,qd=qx.getImageData(0,0,W,H).data;
    const out=cv.getContext('2d').createImageData(W,H),od=out.data;
    let changed=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=(y*W+x)*4,inB=x<bi.naturalWidth&&y<bi.naturalHeight,inQ=x<qi.naturalWidth&&y<qi.naturalHeight;
      let d;
      if(!inB||!inQ)d=255;
      else d=Math.max(Math.abs(bd[i]-qd[i]),Math.abs(bd[i+1]-qd[i+1]),Math.abs(bd[i+2]-qd[i+2]));
      if(d>TH){od[i]=HOT[0];od[i+1]=HOT[1];od[i+2]=HOT[2];od[i+3]=255;changed++;}
      else{const f=inB?0.35:0;od[i]=bd[i]*f;od[i+1]=bd[i+1]*f;od[i+2]=bd[i+2]*f;od[i+3]=255;}
    }
    cv.getContext('2d').putImageData(out,0,0);
    const pct=(changed/(W*H)*100).toFixed(2);
    const sizeNote=(bi.naturalWidth!==qi.naturalWidth||bi.naturalHeight!==qi.naturalHeight)
      ?'size mismatch — base '+bi.naturalWidth+'×'+bi.naturalHeight+', PR '+qi.naturalWidth+'×'+qi.naturalHeight+'; aligned top-left. ':'';
    cap.textContent=sizeNote+pct+'% of pixels differ ('+changed.toLocaleString()+' of '+(W*H).toLocaleString()+')';
  }catch(e){cap.textContent='could not load images: '+e.message;}
}
</script>
</html>`;
}

main();
