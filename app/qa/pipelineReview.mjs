// Review page for the pipeline stack. Writes qa-report/, never public/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '../qa-report/pipeline-review.html');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Pipeline review</title>
<style>body{font:16px/1.4 system-ui;background:#111;color:#eee;max-width:640px;margin:32px auto;padding:0 16px}label{display:block;margin:10px 0}button{margin-top:16px}</style>
</head><body>
<h1>Pipeline review</h1>
<p>App: <a href="http://127.0.0.1:5173/Kinetic_Curator/">http://127.0.0.1:5173/Kinetic_Curator/</a></p>
<ol>
<li><label><input type="checkbox"> Import asks before it replaces the piece.</label></li>
<li><label><input type="checkbox"> After import, the line names the file.</label></li>
<li><label><input type="checkbox"> Export names the file.</label></li>
<li><label><input type="checkbox"> A title becomes the filename.</label></li>
<li><label><input type="checkbox"> A missing palette warns.</label></li>
<li><label><input type="checkbox"> After a change, it says the export is behind.</label></li>
<li><label><input type="checkbox"> Recent names, last five.</label></li>
<li><label><input type="checkbox"> X downloads the project. E still means Evolve.</label></li>
<li><label><input type="checkbox"> Flock then mold bends, the canvas does not fade.</label></li>
<li><label><input type="checkbox"> Voice chip shows a title when it has one.</label></li>
</ol>
<button type="button" id="copy">Copy summary</button>
<pre id="out"></pre>
<script>
document.getElementById('copy').onclick = () => {
  const lines = [...document.querySelectorAll('label')].map((l) => (l.querySelector('input').checked ? '[x] ' : '[ ] ') + l.innerText);
  const text = lines.join('\\n');
  document.getElementById('out').textContent = text;
  navigator.clipboard?.writeText(text);
};
</script>
</body></html>`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(out);
