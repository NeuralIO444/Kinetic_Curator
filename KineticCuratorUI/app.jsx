// Main app — wires all panels together

const { useState: useStateApp, useMemo: useMemoApp } = React;

function App() {
  // ─── Tweaks (persistent palette) ───
  const [tweaks, setTweak] = useTweaks(window.__TWEAK_DEFAULTS__);
  const palettes = window.PALETTES;
  const palette = palettes.find(p => p.id === tweaks.paletteId) || palettes[0];

  // ─── KineticCurator master state ───
  const [running, setRunning] = useStateApp(true);
  const [fps, setFps] = useStateApp(58.4);
  const [seed, setSeed] = useStateApp(0xa17e9b21);

  // ─── AssetPool state ───
  const [enabled, setEnabled] = useStateApp(() => {
    const e = {}; window.ASSETS.forEach(a => { e[a.id] = true; }); return e;
  });
  const [search, setSearch] = useStateApp('');
  const [catFilter, setCatFilter] = useStateApp('all');
  const [view, setView] = useStateApp('grid');

  // ─── LayoutManager params ───
  const [layoutParams, setLayoutParams] = useStateApp({
    composition: 'praystation',
    mode: 'fibonacci',
    count: 240,
    scale: [0.4, 1.6],
    rotate: [-180, 180],
    alpha: [40, 100],
    zTiers: 4,
    jitter: 24,
    density: 78,
    bleed: false,
    recolor: true,
    mirror: false,
    overlap: true,
  });

  // ─── InputRouter ───
  const [routes, setRoutes] = useStateApp([
    { target: 'count',   gain: 1.20 },
    { target: 'scale',   gain: 0.85 },
    { target: 'rotate',  gain: 1.00 },
    { target: '—',       gain: 1.00 },
    { target: 'palette.shift', gain: 0.60 },
    { target: 'mode.cycle', gain: 0.50 },
  ]);

  // ─── Output / snapshots ───
  const [snapshots, setSnapshots] = useStateApp([
    { id: '0001', fmt: 'PNG', ts: '04:12:08', seed: 0xa17e9b21 },
    { id: '0002', fmt: 'PDF', ts: '04:14:33', seed: 0x9ab3f117 },
  ]);
  const addSnapshot = (fmt) => {
    const id = String(snapshots.length + 1).padStart(4, '0');
    const d = new Date();
    const ts = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    setSnapshots([...snapshots, { id, fmt: fmt.toUpperCase(), ts, seed }]);
  };

  const enabledCount = useMemoApp(() => Object.values(enabled).filter(Boolean).length, [enabled]);

  // Derive page CSS vars from palette
  const pageStyle = {
    '--bg': palette.bg,
    '--ink': palette.ink,
    '--accent': palette.swatches[0],
    '--accent2': palette.swatches[1],
    '--accent3': palette.swatches[2],
  };

  return (
    <div className="app" style={pageStyle}>
      <MasterBar
        palette={palette}
        setPaletteId={(id) => setTweak('paletteId', id)}
        palettes={palettes}
        running={running}
        setRunning={setRunning}
        fps={fps}
        seed={seed}
        setSeed={setSeed}
        assetsActive={enabledCount}
        assetsTotal={window.ASSETS.length}
      />

      <div className="grid">
        {/* col 1: canvas + output */}
        <div className="col col-a">
          <CanvasPreview
            palette={palette}
            params={layoutParams}
            enabled={enabled}
            seed={seed}
            running={running}
            onFpsTick={setFps}
          />
          <OutputPanel palette={palette} layout={layoutParams} seed={seed}
            snapshots={snapshots} addSnapshot={addSnapshot}/>
        </div>
        {/* col 2: pool */}
        <div className="col col-b">
          <AssetPool
            ink={palette.swatches[0]}
            accent={palette.swatches[1]}
            bg={palette.bg}
            enabled={enabled}
            setEnabled={setEnabled}
            search={search} setSearch={setSearch}
            catFilter={catFilter} setCatFilter={setCatFilter}
            view={view} setView={setView}
          />
        </div>
        {/* col 3: router + layout */}
        <div className="col col-c">
          <InputRouter routes={routes} setRoutes={setRoutes}/>
          <LayoutManager params={layoutParams} setParams={setLayoutParams}/>
        </div>
      </div>

      <footer className="footer-bar">
        <span className="mono">// KineticCurator · Praystation_Ape · {new Date().getFullYear()} · awaiting OSC bridge :: localhost:9001</span>
        <span className="mono">target.framerate=60 · sketchPath=~/sketches/kinetic_curator/ · data/ {window.ASSETS.length} svg</span>
      </footer>

      <TweaksPanel title="TWEAKS">
        <TweakSection title="palette">
          <TweakSelect label="active" value={tweaks.paletteId}
            options={palettes.map(p => ({ value: p.id, label: `${p.name} — ${p.era}` }))}
            onChange={v => setTweak('paletteId', v)} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
