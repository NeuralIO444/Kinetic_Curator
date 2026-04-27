// KineticCurator UI components
// Lo-fi terminal aesthetic; single dense screen

const { useState, useMemo, useEffect, useRef } = React;

// ───────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────
function svgWrap(asset, ink, accent, size = 64) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" style="--ink:${ink};--accent:${accent}">${asset.svg}</svg>`;
}

function downloadSVG(asset, ink, accent) {
  const svg = svgWrap(asset, ink, accent, 100).replace('--ink:'+ink, `--ink:${ink}`);
  // Inline the colors so the downloaded file renders standalone
  const inlined = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${asset.svg.replace(/var\(--ink\)/g, ink).replace(/var\(--accent\)/g, accent)}</svg>`;
  const blob = new Blob([inlined], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${asset.id}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function classNames(...args) { return args.filter(Boolean).join(' '); }

// ───────────────────────────────────────────────────────────────
// Section header (shared chrome)
// ───────────────────────────────────────────────────────────────
function PanelHeader({ tag, title, subtitle, right }) {
  return (
    <div className="panel-header">
      <div className="panel-header-left">
        <span className="panel-tag">{tag}</span>
        <span className="panel-title">{title}</span>
        {subtitle && <span className="panel-subtitle">{subtitle}</span>}
      </div>
      {right && <div className="panel-header-right">{right}</div>}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Master / KineticCurator status bar (top)
// ───────────────────────────────────────────────────────────────
function MasterBar({ palette, setPaletteId, palettes, running, setRunning, fps, seed, setSeed, assetsActive, assetsTotal }) {
  return (
    <header className="master-bar">
      <div className="master-left">
        <div className="logo">
          <span className="logo-mark">▓</span>
          <span className="logo-text">KINETIC<span className="logo-accent">·</span>CURATOR</span>
          <span className="logo-version">v0.4.1</span>
        </div>
        <div className="status-pill">
          <span className={classNames('status-dot', running && 'live')} />
          <span>{running ? 'RUNNING' : 'PAUSED'}</span>
        </div>
        <div className="meter">
          <span className="meter-label">FPS</span>
          <span className="meter-value">{fps.toFixed(1)}</span>
          <FpsBar fps={fps} />
        </div>
        <div className="meter">
          <span className="meter-label">POOL</span>
          <span className="meter-value">{assetsActive}/{assetsTotal}</span>
        </div>
        <div className="meter">
          <span className="meter-label">SEED</span>
          <span className="meter-value mono">{seed.toString(16).padStart(8, '0').toUpperCase()}</span>
          <button className="micro-btn" onClick={() => setSeed(Math.floor(Math.random() * 0xffffffff))}>↻</button>
        </div>
      </div>
      <div className="master-right">
        <div className="palette-switch">
          <span className="palette-switch-label">PALETTE</span>
          {palettes.map(p => (
            <button
              key={p.id}
              className={classNames('palette-chip', palette.id === p.id && 'active')}
              onClick={() => setPaletteId(p.id)}
              title={p.name + ' — ' + p.era}
            >
              <span className="palette-chip-swatches">
                {p.swatches.slice(0, 5).map((s, i) => (
                  <span key={i} className="palette-chip-sw" style={{ background: s }} />
                ))}
              </span>
              <span className="palette-chip-name">{p.name}</span>
            </button>
          ))}
        </div>
        <button className="run-btn" onClick={() => setRunning(r => !r)}>
          {running ? '◼ STOP' : '▶ RUN'}
        </button>
      </div>
    </header>
  );
}

function FpsBar({ fps }) {
  const pct = Math.min(100, (fps / 60) * 100);
  const tone = fps > 50 ? 'good' : fps > 30 ? 'mid' : 'bad';
  return (
    <span className={classNames('fps-bar', tone)}>
      <span className="fps-bar-fill" style={{ width: pct + '%' }} />
    </span>
  );
}

window.MasterBar = MasterBar;
window.PanelHeader = PanelHeader;
window.svgWrap = svgWrap;
window.downloadSVG = downloadSVG;
window.classNames = classNames;
