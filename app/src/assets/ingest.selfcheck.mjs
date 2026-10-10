import assert from 'node:assert';
import { ingestSvg, duplicateAsset, overlayId } from './ingest.js';
import { ingestIntoOverlay } from './overlay.js';

const bad = ingestSvg('<svg><script>alert(1)</script></svg>');
assert.strictEqual(bad.ok, false);
assert.match(bad.error, /hostile/);

const ok = ingestSvg('<svg viewBox="0 0 512 512"><path d="M10 10 L20 20" fill="#e0245e"/></svg>', { id: 'blob' });
assert.strictEqual(ok.ok, true);
assert.strictEqual(ok.asset.id, 'user:blob');
assert.ok(ok.asset.svg.includes('var(--accent)'));
assert.ok(!ok.asset.svg.includes('#e0245e'));
assert.strictEqual(ok.asset.compound, false);

const two = ingestSvg('<g><circle cx="1" cy="1" r="1"/><path d="M0 0L1 1"/></g>');
assert.strictEqual(two.ok, true);
assert.strictEqual(two.asset.compound, true);

const dup = duplicateAsset({ id: 'org_blob', svg: '<path d="M0 0"/>', category: 'organic' });
assert.strictEqual(dup.asset.id, 'user:org_blob_2');
assert.notStrictEqual(dup.asset.id, 'org_blob');

assert.strictEqual(overlayId('org_bl_organic'), 'user:org_bl_organic');

const dropPath = ingestIntoOverlay('<svg><script>alert(1)</script></svg>', [], 'dropped.svg');
assert.strictEqual(dropPath.ok, false);

assert.strictEqual(ingestSvg('<svg><linearGradient href="https://evil.test/x"/></svg>').ok, false);
assert.strictEqual(ingestSvg('<svg><linearGradient xlink:href="data:image/svg+xml,x"/></svg>').ok, false);
assert.strictEqual(ingestSvg('<svg><circle style="fill:url(https://evil.test)" r="1"/></svg>').ok, false);
assert.strictEqual(ingestSvg('<svg><path d="M0 0&#x20;L1 1"/></svg>').ok, false);
const localHref = ingestSvg('<svg><linearGradient id="g"/><rect href="#g" width="1" height="1"/></svg>');
assert.strictEqual(localHref.ok, true);

let nest = '<svg>';
for (let i = 0; i < 30; i++) nest += '<g>';
for (let i = 0; i < 30; i++) nest += '</g>';
nest += '</svg>';
assert.strictEqual(ingestSvg(nest).ok, false);

console.log('ingest.selfcheck: OK');

// ---- #1275: forgiving ingest + actionable errors ----

// auto-fit: in-bounds content is a byte-identical no-op
const inb = ingestSvg('<svg viewBox="0 0 100 100"><path d="M10 10L90 90"/></svg>', { id: 'inb' });
assert.strictEqual(inb.ok, true);
assert.strictEqual(inb.asset.svg, '<path d="M10 10L90 90"/>');

// auto-fit: no viewBox/width/height -> no-op (re-ingest path)
const novb = ingestSvg('<g><circle cx="50" cy="50" r="10"/></g>', { id: 'novb' });
assert.strictEqual(novb.ok, true);
assert.strictEqual(novb.asset.svg, '<g><circle cx="50" cy="50" r="10"/></g>');

// auto-fit: out-of-bounds square scales to fit, aspect preserved
const big = ingestSvg('<svg viewBox="0 0 512 512"><path d="M0 0L1 1"/></svg>', { id: 'big' });
assert.strictEqual(big.ok, true);
assert.strictEqual(big.asset.svg, '<g transform="translate(0,0) scale(0.1953)"><path d="M0 0L1 1"/></g>');

// auto-fit: wide artboard centers vertically
const wide = ingestSvg('<svg viewBox="0 0 200 100"><rect width="1" height="1"/></svg>', { id: 'wide' });
assert.strictEqual(wide.asset.svg, '<g transform="translate(0,25) scale(0.5)"><rect width="1" height="1"/></g>');

// auto-fit: offset viewBox translates to origin
const off = ingestSvg('<svg viewBox="50 50 200 200"><rect width="1" height="1"/></svg>', { id: 'off' });
assert.strictEqual(off.asset.svg, '<g transform="translate(-25,-25) scale(0.5)"><rect width="1" height="1"/></g>');

// auto-fit: width/height fallback (no viewBox), px units tolerated
const wh = ingestSvg('<svg width="582px" height="400px"><path d="M0 0L1 1"/></svg>', { id: 'wh' });
assert.strictEqual(wh.ok, true);
assert.strictEqual(wh.asset.svg, '<g transform="translate(0,15.6357) scale(0.1718)"><path d="M0 0L1 1"/></g>');

// auto-fit: malformed viewBox -> safe no-op, still ingests
const badvb = ingestSvg('<svg viewBox="0 0 banana"><path d="M0 0L1 1"/></svg>', { id: 'badvb' });
assert.strictEqual(badvb.ok, true);
assert.strictEqual(badvb.asset.svg, '<path d="M0 0L1 1"/>');

// CSS conversion: Illustrator Internal-CSS classes become presentation attributes
const css = ingestSvg(
  '<svg viewBox="0 0 100 100"><style>.st0{fill:none;stroke:#000000;stroke-width:12;}</style><path class="st0" d="M0 0L10 10"/></svg>',
  { id: 'css' }
);
assert.strictEqual(css.ok, true);
assert.ok(!css.asset.svg.includes('<style'), 'style block removed');
assert.strictEqual(
  css.asset.svg,
  '<path class="st0" d="M0 0L10 10" fill="none" stroke="#000000" stroke-width="12"/>'
);

// CSS conversion: attribute already on the element wins over the class
const css2 = ingestSvg(
  '<svg><style>.st0{fill:red;stroke:blue;}</style><path class="st0" fill="green" d="M0 0"/></svg>',
  { id: 'css2' }
);
assert.strictEqual(css2.ok, true);
assert.ok(css2.asset.svg.includes('fill="green"'));
assert.ok(css2.asset.svg.includes('stroke="blue"'));
assert.ok(!css2.asset.svg.includes('fill="red"'));

// CSS conversion: fancy stylesheet falls back to stripping (yesterday's behavior)
const css3 = ingestSvg(
  '<svg><style>@media screen{.st0{fill:red;}}</style><path class="st0" d="M0 0"/></svg>',
  { id: 'css3' }
);
assert.strictEqual(css3.ok, true);
assert.ok(!css3.asset.svg.includes('style'));
assert.ok(!css3.asset.svg.includes('fill="red"'));

// CSS conversion: unsafe values never become attributes
const css4 = ingestSvg(
  '<svg><style>.st0{fill:url(https://evil.test/x);}</style><path class="st0" d="M0 0"/></svg>',
  { id: 'css4' }
);
assert.strictEqual(css4.ok, true);
assert.ok(!css4.asset.svg.includes('url('));

// error hints: every rejection maps to an actionable suggestion
const t = ingestSvg('<svg><text>hi</text></svg>');
assert.strictEqual(t.ok, false);
assert.strictEqual(t.error, 'tag not allowed: text');
assert.match(t.hint, /Create Outlines/);

const flt = ingestSvg('<svg><filter><feGaussianBlur/></filter></svg>');
assert.strictEqual(flt.ok, false);
assert.strictEqual(flt.error, 'tag not allowed: filter');
assert.match(flt.hint, /Expand Appearance/);

const img = ingestSvg('<svg><image href="x.png" width="1" height="1"/></svg>');
assert.strictEqual(img.ok, false);
assert.strictEqual(img.error, 'raster image');
assert.match(img.hint, /vector/);

const tooBig = ingestSvg('<svg>' + 'x'.repeat(49000) + '</svg>');
assert.strictEqual(tooBig.ok, false);
assert.strictEqual(tooBig.error, 'too large');
assert.match(tooBig.hint, /48KB/);

const hostile = ingestSvg('<svg><script>alert(1)</script></svg>');
assert.strictEqual(hostile.error, 'hostile markup');
assert.strictEqual(hostile.hint, 'Unsupported markup');

const empty = ingestSvg('   ');
assert.strictEqual(empty.ok, false);
assert.strictEqual(empty.error, 'empty');
assert.ok(empty.hint && empty.hint.length > 0);

const deep = ingestSvg('<svg>' + '<g>'.repeat(30) + '</g>'.repeat(30) + '</svg>');
assert.strictEqual(deep.error, 'too deep');
assert.ok(deep.hint);

// hint threads through the overlay helpers into the panel's INGEST line
const ov = ingestIntoOverlay('<svg><text>hi</text></svg>', [], 'dropped.svg');
assert.strictEqual(ov.ok, false);
assert.match(ov.hint, /Create Outlines/);

console.log('ingest.selfcheck #1275: OK');
