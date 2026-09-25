// node qa/report.selfcheck.mjs — the report renderer escapes everything and marks failures.
import assert from 'node:assert';
import { renderReport, esc } from './report.mjs';

assert.strictEqual(esc(`<b>"x"&'y'</b>`), '&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;');

const html = renderReport([
  { name: 'good', describe: 'd', pass: true, steps: [{ kind: 'check', label: 'a', pass: true, detail: '' }, { kind: 'shot', label: 'pic', file: 'good/01.png' }] },
  { name: '<evil>', describe: '<script>x</script>', pass: false, steps: [{ kind: 'check', label: 'b', pass: false, detail: '<img onerror=1>' }] },
]);
assert.match(html, /1 of 2 scenario\(s\) FAILED/);
assert.ok(!html.includes('<script>x</script>') && !html.includes('<img onerror=1>'), 'nothing unescaped reaches the page');
assert.match(html, /src="good\/01\.png"/);
assert.match(renderReport([{ name: 'g', describe: '', pass: true, steps: [] }]), /all 1 scenario\(s\) passed/);
console.log('qa/report.selfcheck: OK');
