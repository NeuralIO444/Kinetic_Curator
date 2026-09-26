// node qa/board.mjs [--serve [port]] [--open]
//   npm run board                  build the board once -> app/qa-report/board.html
//   npm run board -- --open        build and open it in the browser
//   npm run board -- --serve 8137  serve it on localhost, regenerating every 60s
//
// The build board: every open PR on NeuralIO444/Kinetic_Curator, its CI status
// in Matt's exact words, and what each PR is waiting on — so nobody has to ask
// "what's happening with the queue". Shells out to `gh`; node stdlib only.
import { execFileSync, execFile } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO = 'NeuralIO444/Kinetic_Curator';
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');
const REPORT_DIR = join(APP, 'qa-report');
const LANES_FILE = join(HERE, 'lanes.json');

// ---------------------------------------------------------------------------
// lanes
// ---------------------------------------------------------------------------

// Built-in issue-number -> lane rules. A PR links its issue via "(#NNN)" in the
// title or branch name. app/qa/lanes.json overrides these per PR number.
const LANE_RULES = [
  [/^(58[2-9]|59[0-2])$/, 'tropism'],                       // #582-#592 Tropism batch
  [/^(564|623|624|625|626|631|632)$/, 'sleight-of-hand'],    // sleight v2 batch
  [/^(503|533|561|628|655)$/, 'backend'],                   // invisible backend work
  [/^532$/, 'fidelity'],                                    // ACES + dither
  [/^(606|607|608)$/, 'pipeline'],                          // Pipeline tab phases
  [/^(61[3-8])$/, 'davis-stimuli'],                         // Davis + Stimuli plan
  [/^(630|646|647|648|649|650|651|652|653|654)$/, 'import-export'],
  [/^(519|558|560)$/, 'motion'],
  [/^(520|594)$/, 'fx'],
  [/^(534|535|536|548)$/, 'shell'],
];

// Lanes whose PRs change what Matt sees (review lane); everything else is backend.
const VISUAL_LANES = new Set([
  'tropism', 'sleight-of-hand', 'fidelity', 'pipeline', 'davis-stimuli',
  'import-export', 'motion', 'fx', 'shell',
]);

function issueNumberOf(pr) {
  const m = `${pr.title} ${pr.headRefName}`.match(/#(\d{3,4})\b/);
  return m ? m[1] : null;
}

function loadOverrides() {
  try {
    const raw = JSON.parse(readFileSync(LANES_FILE, 'utf8'));
    const out = {};
    for (const [k, v] of Object.entries(raw)) if (!k.startsWith('_')) out[k] = v;
    return out;
  } catch { return {}; }
}

export function laneFor(pr, overrides = loadOverrides()) {
  if (overrides[String(pr.number)]) return overrides[String(pr.number)];
  const issue = issueNumberOf(pr);
  if (issue) for (const [re, lane] of LANE_RULES) if (re.test(issue)) return lane;
  return 'other';
}

export function isVisual(lane) { return VISUAL_LANES.has(lane); }

// ---------------------------------------------------------------------------
// status — Matt's exact words
// ---------------------------------------------------------------------------

const FAIL_STATES = new Set(['FAILURE', 'TIMED_OUT', 'ACTION_REQUIRED']);

// Returns { pill, section } where section is one of:
// ready (merge now) | review (your eyes) | working (builder/CI) | attention (broken)
export function classify(pr, checks, merge) {
  const states = checks.map((c) => c.state).filter(Boolean);
  if (merge.mergeable === 'CONFLICTING' || merge.mergeStateStatus === 'DIRTY') {
    return { pill: 'CONFLICTING', section: 'attention' };
  }
  if (states.some((s) => FAIL_STATES.has(s))) return { pill: 'CI red', section: 'attention' };
  if (states.length === 0) return { pill: 'BLOCKED', section: 'working', note: 'no checks reported yet' };
  if (states.some((s) => s !== 'SUCCESS')) return { pill: 'BLOCKED', section: 'working' };
  // CI green from here on.
  if (pr.isDraft) return { pill: 'CI green', section: 'review' };
  if (merge.mergeable === 'MERGEABLE' && merge.mergeStateStatus === 'CLEAN') {
    return { pill: 'CI green', section: 'ready' };
  }
  return { pill: 'CI green', section: 'working', note: `merge state: ${merge.mergeStateStatus}` };
}

// ---------------------------------------------------------------------------
// fetching
// ---------------------------------------------------------------------------

function ghJson(args) {
  const out = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

async function fetchBoard() {
  const prs = ghJson(['pr', 'list', '--repo', REPO, '--state', 'open', '--limit', '50',
    '--json', 'number,title,headRefName,baseRefName,isDraft,updatedAt,author,url']);
  const overrides = loadOverrides();
  const rows = await Promise.all(prs.map(async (pr) => {
    let checks = [], merge = {};
    try { checks = ghJson(['pr', 'checks', String(pr.number), '--repo', REPO, '--json', 'name,state']); }
    catch { checks = []; }
    try { merge = ghJson(['pr', 'view', String(pr.number), '--repo', REPO, '--json', 'mergeable,mergeStateStatus']); }
    catch { merge = {}; }
    const lane = laneFor(pr, overrides);
    const { pill, section, note } = classify(pr, checks, merge);
    return { ...pr, lane, visual: isVisual(lane), pill, section, note: note || '' };
  }));
  rows.sort((a, b) => a.number - b.number);
  return rows;
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function age(iso, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const PILL_CLASS = { 'CI green': 'ok', 'BLOCKED': 'wait', 'CI red': 'bad', 'CONFLICTING': 'bad' };

const SECTIONS = [
  ['ready', 'Ready to merge', 'CI green, mergeable, not a draft. Your merge call.'],
  ['review', 'Needs your review', 'CI green drafts. Feel-check the visual ones; backend ones just need a glance.'],
  ['working', 'Builder working', 'CI still running, or waiting on the builder.'],
  ['attention', 'Needs attention', 'Failing checks or merge conflicts.'],
];

function rowHtml(r) {
  const pill = PILL_CLASS[r.pill] || 'wait';
  const kind = r.visual ? '<span class="kind vis">visual</span>' : '<span class="kind be">backend</span>';
  return `<div class="row">`
    + `<div class="main"><a href="${esc(r.url)}">#${r.number}</a> <span class="title">${esc(r.title)}</span></div>`
    + `<div class="meta"><span class="lane">${esc(r.lane)}</span>${kind}`
    + `<span class="pill ${pill}">${esc(r.pill)}</span>`
    + `<span class="age">${esc(age(r.updatedAt))}</span>`
    + `<span class="branch">${esc(r.headRefName)}</span>`
    + (r.note ? `<span class="note">${esc(r.note)}</span>` : '')
    + `</div></div>`;
}

export function renderBoard(rows, { refreshSecs = 0 } = {}) {
  const when = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const sections = SECTIONS.map(([key, title, sub]) => {
    const items = rows.filter((r) => r.section === key);
    const body = items.length
      ? items.map(rowHtml).join('\n')
      : `<div class="empty">— none —</div>`;
    return `<section><h2>${esc(title)} <span class="count">${items.length}</span></h2>`
      + `<p class="sub">${esc(sub)}</p>\n${body}</section>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + (refreshSecs ? `<meta http-equiv="refresh" content="${refreshSecs}">` : '')
    + `<title>KC build board</title><style>
body{background:#111;color:#e8e8e8;font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px;max-width:760px}
h1{font-size:20px;margin:0 0 2px}.ts{color:#888;font-size:12px;margin-bottom:16px}
section{margin-bottom:22px}h2{font-size:15px;margin:0 0 2px;text-transform:uppercase;letter-spacing:.04em}
.count{background:#333;border-radius:10px;padding:0 8px;font-size:12px}.sub{color:#888;font-size:12px;margin:0 0 8px}
.row{background:#1b1b1b;border:1px solid #2a2a2a;border-radius:8px;padding:8px 10px;margin-bottom:6px}
.main a{color:#7db3ff;text-decoration:none;font-weight:600}.title{color:#ddd}
.meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px;font-size:12px}
.lane{background:#2c2c34;border-radius:4px;padding:1px 7px;color:#c9c9d4}
.kind{border-radius:4px;padding:1px 7px}.vis{background:#12351f;color:#7fe0a0}.be{background:#33261a;color:#e8b96a}
.pill{border-radius:4px;padding:1px 7px;font-weight:700}
.ok{background:#12351f;color:#7fe0a0}.wait{background:#3a2f12;color:#f0c96a}.bad{background:#3d1515;color:#ff8a8a}
.age{color:#888}.branch{font-family:ui-monospace,monospace;color:#999;font-size:11px}.note{color:#f0c96a}
.empty{color:#555;font-size:12px}
</style></head><body><h1>Kinetic_Curator build board</h1>`
    + `<div class="ts">${rows.length} open PRs · refreshed ${esc(when)} PT</div>`
    + sections + `</body></html>`;
}

// ---------------------------------------------------------------------------
// cli
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = { serve: 0, open: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--open') out.open = true;
    else if (argv[i] === '--serve') {
      const next = argv[i + 1];
      out.serve = next && !next.startsWith('--') ? (parseInt(next, 10) || 8137) : 8137;
      if (next && !next.startsWith('--')) i++;
    }
  }
  return out;
}

async function generate({ refreshSecs = 0 } = {}) {
  const rows = await fetchBoard();
  const html = renderBoard(rows, { refreshSecs });
  mkdirSync(REPORT_DIR, { recursive: true });
  const file = join(REPORT_DIR, 'board.html');
  writeFileSync(file, html);
  const bySection = Object.fromEntries(SECTIONS.map(([k]) => [k, rows.filter((r) => r.section === k).length]));
  console.log(`board: ${rows.length} open PRs -> ${file}`);
  console.log(`ready ${bySection.ready} · review ${bySection.review} · working ${bySection.working} · attention ${bySection.attention}`);
  return { file, html };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
const opts = parseArgs(process.argv.slice(2));

if (opts.serve) {
  let current = '';
  const regen = async () => {
    try { current = (await generate({ refreshSecs: 60 })).html; }
    catch (e) { console.error('regenerate failed:', e.message); }
  };
  await regen();
  setInterval(regen, 60000);
  createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(current);
  }).listen(opts.serve, '127.0.0.1', () => {
    console.log(`board serving at http://127.0.0.1:${opts.serve}/ (refreshes every 60s)`);
  });
} else {
  const { file } = await generate();
  if (opts.open) execFile('open', [file]);
}
}
