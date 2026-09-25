// qa/report.mjs — pure HTML for the QA report (unit-tested in report.selfcheck.mjs).
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderReport(results) {
  const total = results.length;
  const failed = results.filter((r) => !r.pass).length;
  const body = results.map((r) => `
<section class="scn ${r.pass ? 'ok' : 'bad'}">
  <h2><span class="badge">${r.pass ? 'PASS' : 'FAIL'}</span> ${esc(r.name)}</h2>
  <p class="desc">${esc(r.describe)}</p>
  ${r.steps.map((s) => s.kind === 'shot'
    ? `<figure><figcaption>${esc(s.label)}</figcaption><a href="${esc(s.file)}"><img src="${esc(s.file)}" alt="${esc(s.label)}"></a></figure>`
    : `<div class="step ${s.pass ? 'ok' : 'bad'}"><span class="badge">${s.pass ? 'PASS' : 'FAIL'}</span> ${esc(s.label)}${s.detail ? `<pre>${esc(s.detail)}</pre>` : ''}</div>`).join('\n')}
</section>`).join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>KC-1 QA report</title>
<style>
:root{color-scheme:dark light;--bg:#0d0d0d;--fg:#e8e8e0;--ok:#00c26e;--bad:#ff2d6f;--line:#2a2a2a}
@media (prefers-color-scheme:light){:root{--bg:#fafafa;--fg:#161616;--line:#ddd}}
body{background:var(--bg);color:var(--fg);font:14px/1.5 ui-monospace,Menlo,monospace;margin:0;padding:16px;max-width:1100px}
h1{font-size:18px}h2{font-size:15px;margin:0}
.scn{border:1px solid var(--line);border-left:4px solid var(--ok);padding:12px 14px;margin:16px 0}.scn.bad{border-left-color:var(--bad)}
.badge{font-weight:700;padding:1px 6px;border-radius:3px;background:var(--ok);color:#000;font-size:12px}
.bad>h2>.badge,.step.bad .badge{background:var(--bad);color:#fff}
.desc{opacity:.7;margin:4px 0 10px}.step{margin:6px 0}pre{white-space:pre-wrap;margin:4px 0 0 0;opacity:.8}
figure{margin:10px 0}figcaption{opacity:.7;font-size:12px}img{max-width:100%;border:1px solid var(--line)}
</style>
<h1>KC-1 QA report — ${failed ? `${failed} of ${total} scenario(s) FAILED` : `all ${total} scenario(s) passed`}</h1>
${body}
</html>`;
}
