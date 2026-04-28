// Main app — wires all panels together

const { useState: useStateApp, useMemo: useMemoApp, useRef: useRefApp, useEffect: useEffectApp, useCallback: useCallbackApp } = React;

function Meter({ label, value, color }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="stim-meter-row">
      <span className="stim-meter-label mono">{label}</span>
      <div className="stim-meter-track">
        <div className="stim-meter-fill" style={{ width: pct + '%', background: color }} />
      </div>
      <span className="stim-meter-readout mono">{String(pct).padStart(3, '0')}</span>
    </div>
  );
}

function StimulusPanel({
  palette, webcamEnabled, setWebcamEnabled, audioEnabled, setAudioEnabled,
  motionEnergy, audioStimulus, beatPulse, audioBands,
  onMotion, onStimulus, onBeat, onFreq,
}) {
  const [collapsed, toggle] = useCollapse(false);
  const accent = palette.swatches[0];
  const accent2 = palette.swatches[1];
  const accent3 = palette.swatches[2] || accent;
  return (
    <section className="panel panel-stimulus">
      <PanelHeader
        tag="P06"
        title="STIMULUS.in"
        subtitle="webcam · mic · OSC bridge"
        collapsed={collapsed}
        onToggle={toggle}
        right={
          <div className="header-tools">
            {webcamEnabled && <span className="meter-pill mono" style={{ color: accent }}>VID</span>}
            {audioEnabled && <span className="meter-pill mono" style={{ color: accent2 }}>AUD</span>}
            {(motionEnergy > 0 || audioStimulus > 0) && (
              <span className="meter-pill mono">{Math.round(Math.max(motionEnergy, audioStimulus) * 100)}%</span>
            )}
          </div>
        }
      />
      {!collapsed && (
        <div className="panel-body stim-body">
          <div className="stim-toggle-row">
            <button
              type="button"
              className={classNames('stim-toggle', webcamEnabled && 'on')}
              aria-pressed={webcamEnabled}
              onClick={() => setWebcamEnabled(!webcamEnabled)}
              style={webcamEnabled ? { background: accent, color: '#000', borderColor: accent } : undefined}
            >
              <span className={classNames('status-dot', webcamEnabled && 'live')}/>
              VIDEO {webcamEnabled ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className={classNames('stim-toggle', audioEnabled && 'on')}
              aria-pressed={audioEnabled}
              onClick={() => setAudioEnabled(!audioEnabled)}
              style={audioEnabled ? { background: accent2, color: '#000', borderColor: accent2 } : undefined}
            >
              <span className={classNames('status-dot', audioEnabled && 'live')}/>
              AUDIO {audioEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <WebcamInput enabled={webcamEnabled} onMotion={onMotion} onFrameData={() => {}} />
          <AudioInput enabled={audioEnabled} onStimulus={onStimulus} onBeatDetect={onBeat} onFrequencyData={onFreq} />

          <div className="stim-meters stim-meters-grid">
            <Meter label="motion" value={motionEnergy} color={accent} />
            <Meter label="audio·rms" value={audioStimulus} color={accent2} />
            <Meter label="bass" value={audioBands.bass} color={accent3} />
            <Meter label="mid" value={audioBands.mid} color={accent2} />
            <Meter label="treble" value={audioBands.treble} color={accent} />
            <Meter label="beat" value={beatPulse} color="#0f0" />
          </div>

          {!webcamEnabled && !audioEnabled && (
            <div className="stim-hint mono">enable a source to drive layout · count, scale, beat-throb</div>
          )}
        </div>
      )}
    </section>
  );
}

function DavisModePanel({
  palette, evolveMode, setEvolveMode, evolveSource, setEvolveSource,
  evolveInterval, setEvolveInterval, slowRender, setSlowRender,
  audioEnabled, onSnapshot, onFavorite,
  favorites, recallFavorite, removeFavorite,
}) {
  const [collapsed, toggle] = useCollapse(false);
  const accent = palette.swatches[0];
  const accent2 = palette.swatches[1];
  return (
    <section className="panel panel-davis">
      <PanelHeader
        tag="P07"
        title="DAVIS_MODE.pde"
        subtitle="evolve · capture · curate"
        collapsed={collapsed}
        onToggle={toggle}
        right={
          <div className="header-tools">
            {evolveMode && <span className="meter-pill mono" style={{ color: accent }}>EVOLVE·{evolveSource}</span>}
            {slowRender && <span className="meter-pill mono" style={{ color: accent2 }}>SLOW</span>}
            <span className="meter-pill mono">{favorites.length} fav</span>
          </div>
        }
      />
      {!collapsed && (
        <div className="panel-body davis-body">
          <div className="davis-row">
            <button
              type="button"
              className={classNames('stim-toggle', evolveMode && 'on')}
              aria-pressed={!!evolveMode}
              onClick={() => setEvolveMode(!evolveMode)}
              style={evolveMode ? { background: accent, color: '#000', borderColor: accent } : undefined}
              title="auto-bump the seed (e)"
            >
              <span className={classNames('status-dot', evolveMode && 'live')} />
              EVOLVE {evolveMode ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              className={classNames('stim-toggle', slowRender && 'on')}
              aria-pressed={slowRender}
              onClick={() => setSlowRender(!slowRender)}
              style={slowRender ? { background: accent2, color: '#000', borderColor: accent2 } : undefined}
              title="contemplative ~2fps render"
            >
              <span className={classNames('status-dot', slowRender && 'live')} />
              SLOW {slowRender ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="davis-source-row">
            <span className="davis-label mono">source</span>
            <button
              className={classNames('chip-btn', evolveSource === 'time' && 'active')}
              onClick={() => setEvolveSource('time')}
            >TIME</button>
            <button
              className={classNames('chip-btn', evolveSource === 'beat' && 'active')}
              onClick={() => setEvolveSource('beat')}
              disabled={!audioEnabled}
              title={audioEnabled ? 'evolve on detected beat' : 'enable AUDIO to use beat source'}
            >BEAT{!audioEnabled ? ' (audio off)' : ''}</button>
          </div>

          {evolveSource === 'time' && (
            <div className="davis-interval-row">
              <span className="davis-label mono">interval</span>
              <input
                type="range" min={300} max={8000} step={100}
                value={evolveInterval}
                onChange={e => setEvolveInterval(+e.target.value)}
              />
              <span className="mono davis-readout">{(evolveInterval / 1000).toFixed(1)}s</span>
            </div>
          )}

          <div className="davis-actions">
            <button className="big-btn" onClick={onSnapshot} title="save PNG + JSON sidecar (s)">
              ↓ SAVE [s]
            </button>
            <button className="big-btn" onClick={onFavorite} title="store seed only (f)">
              ★ FAV [f]
            </button>
          </div>

          <div className="davis-hint mono">
            keys · <b>s</b>=snap · <b>f</b>=fav · <b>e</b>=evolve · <b>space</b>=run/pause
          </div>

          {favorites.length > 0 && (
            <div className="favorites-list">
              <div className="favorites-header mono">favorites · {favorites.length}</div>
              {favorites.slice().reverse().map((f, ri) => {
                const i = favorites.length - 1 - ri;
                return (
                  <div key={i} className="fav-row">
                    <span className="fav-id mono">{f.id}</span>
                    <span className="fav-seed mono">{f.seedHex.slice(0, 8)}</span>
                    <span className="fav-meta mono">{f.composition}/{f.mode}</span>
                    <span className="fav-ts mono">{f.ts}</span>
                    <button className="micro-btn" onClick={() => recallFavorite(f)} title="recall">↺</button>
                    <button className="micro-btn" onClick={() => removeFavorite(i)} title="remove">✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function App() {
  const canvasRef = useRefApp(null);
  // ─── Tweaks (persistent palette) ───
  const [tweaks, setTweak] = useTweaks(window.__TWEAK_DEFAULTS__);
  const palettes = window.PALETTES;
  const palette = palettes.find(p => p.id === tweaks.paletteId) || palettes[0];

  // ─── KineticCurator master state ───
  const [running, setRunning] = useStateApp(true);
  const [fps, setFps] = useStateApp(58.4);
  const [seed, setSeed] = useStateApp(0xa17e9b21);

  // ─── Audio + webcam stimulus ───
  const [audioEnabled, setAudioEnabled] = useStateApp(false);
  const [webcamEnabled, setWebcamEnabled] = useStateApp(false);
  const [motionEnergy, setMotionEnergy] = useStateApp(0);
  const [audioStimulus, setAudioStimulus] = useStateApp(0);
  const [beatPulse, setBeatPulse] = useStateApp(0);
  const [audioBands, setAudioBands] = useStateApp({ bass: 0, mid: 0, treble: 0, rms: 0 });

  // Decay beat pulse so it visibly throbs rather than latches
  useEffectApp(() => {
    if (beatPulse <= 0.001) return;
    const id = setTimeout(() => setBeatPulse(p => p * 0.7), 80);
    return () => clearTimeout(id);
  }, [beatPulse]);

  const onMotion = useCallbackApp((m) => setMotionEnergy(m), []);
  const onStimulus = useCallbackApp((s) => setAudioStimulus(s), []);
  const onBeat = useCallbackApp((b) => setBeatPulse(Math.max(b, 0.6)), []);
  const onFreq = useCallbackApp((f) => setAudioBands({
    bass: (f.bass || 0) / 255,
    mid: (f.mid || 0) / 255,
    treble: (f.treble || 0) / 255,
    rms: f.rms || 0,
  }), []);

  const combinedEnergy = Math.max(motionEnergy, audioStimulus);

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
  const [favorites, setFavorites] = useStateApp([]);

  // ─── Davis-mode: auto-evolve + slow-render ───
  const [evolveMode, setEvolveMode] = useStateApp(false); // 'off' | 'time' | 'beat'
  const [evolveSource, setEvolveSource] = useStateApp('time'); // 'time' or 'beat'
  const [evolveInterval, setEvolveInterval] = useStateApp(2000); // ms for time mode
  const [slowRender, setSlowRender] = useStateApp(false); // ~2fps contemplative mode

  // Time-based evolve
  useEffectApp(() => {
    if (!evolveMode || evolveSource !== 'time' || !running) return;
    const id = setInterval(() => {
      setSeed(s => (s ^ ((Math.random() * 0xffffffff) | 0)) >>> 0);
    }, Math.max(200, evolveInterval));
    return () => clearInterval(id);
  }, [evolveMode, evolveSource, evolveInterval, running]);

  // Beat-based evolve — bumps seed on each detected beat
  const lastBeatSeedRef = useRefApp(0);
  useEffectApp(() => {
    if (!evolveMode || evolveSource !== 'beat' || !running) return;
    if (beatPulse > 0.4 && performance.now() - lastBeatSeedRef.current > 250) {
      lastBeatSeedRef.current = performance.now();
      setSeed(s => (s ^ ((Math.random() * 0xffffffff) | 0)) >>> 0);
    }
  }, [beatPulse, evolveMode, evolveSource, running]);

  // Build the full sidecar config that ships with every snapshot
  const buildConfig = (id, fmt, ts) => ({
    schema: 'kinetic-curator/1',
    id, fmt, ts,
    seed,
    seedHex: seed.toString(16).padStart(8, '0'),
    palette: { id: palette.id, name: palette.name, bg: palette.bg, ink: palette.ink, swatches: palette.swatches },
    layout: layoutParams,
    routes,
    enabledAssets: Object.keys(enabled).filter(k => enabled[k]),
    stimulus: {
      webcamEnabled, audioEnabled,
      motionEnergy, audioStimulus, beatPulse, audioBands,
    },
    evolve: { mode: evolveMode, source: evolveSource, interval: evolveInterval, slowRender },
  });

  const downloadJSON = (filename, obj) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const addSnapshot = (fmt, dims) => {
    const target = dims && dims.w && dims.h ? dims : { w: 2000, h: 1400 }; // default high-res
    const id = String(snapshots.length + 1).padStart(4, '0');
    const d = new Date();
    const ts = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    const config = buildConfig(id, fmt.toUpperCase(), ts);
    config.exportSize = { w: target.w, h: target.h };
    setSnapshots(prev => [...prev, { id, fmt: fmt.toUpperCase(), ts, seed, config }]);

    const stem = `kinetic-curator_${id}_${palette.id}_${layoutParams.composition}_${seed.toString(16).padStart(8,'0').slice(0,8)}_${target.w}x${target.h}`;

    if (fmt === 'json') {
      downloadJSON(`${stem}.json`, config);
      return;
    }

    if (fmt === 'png' && canvasRef.current) {
      const svg = canvasRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = target.w;
      canvas.height = target.h;
      const ctx = canvas.getContext('2d');
      const svgData = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = palette.bg || '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${stem}.png`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }, 'image/png');
      };
      const svgUtf8 = unescape(encodeURIComponent(svgData));
      img.src = 'data:image/svg+xml;base64,' + btoa(svgUtf8);
      // Sidecar JSON next to the PNG
      downloadJSON(`${stem}.json`, config);
    }

    if (fmt === 'pdf') {
      // No native PDF here — emit JSON so the seed is recoverable for offline render
      downloadJSON(`${stem}.json`, config);
    }
  };

  // Save current seed+config without rendering an image — pure curation
  const favoriteCurrent = () => {
    const d = new Date();
    const ts = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    setFavorites(prev => [
      ...prev,
      {
        id: String(prev.length + 1).padStart(3, '0'),
        ts,
        seed,
        seedHex: seed.toString(16).padStart(8, '0'),
        paletteId: palette.id,
        composition: layoutParams.composition,
        mode: layoutParams.mode,
        config: buildConfig('fav-' + (prev.length + 1), 'FAV', ts),
      },
    ]);
  };

  const recallFavorite = (fav) => {
    setSeed(fav.seed);
    if (fav.config) {
      if (fav.config.layout) setLayoutParams(fav.config.layout);
      if (fav.config.palette && fav.config.palette.id) setTweak('paletteId', fav.config.palette.id);
    }
  };

  const removeFavorite = (idx) => setFavorites(prev => prev.filter((_, i) => i !== idx));

  // Hotkey: `s` snapshots, `f` favorites, `e` toggles evolve, `space` run/pause
  useEffectApp(() => {
    const onKey = (e) => {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 's' || e.key === 'S') { e.preventDefault(); addSnapshot('png'); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); favoriteCurrent(); }
      else if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setEvolveMode(m => !m); }
      else if (e.key === ' ') { e.preventDefault(); setRunning(r => !r); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
        {/* col 1: canvas + stimulus (live inputs) */}
        <div className="col col-a">
          <CanvasPreview
            palette={palette}
            params={layoutParams}
            enabled={enabled}
            seed={seed}
            running={running}
            onFpsTick={setFps}
            canvasRef={canvasRef}
            motionEnergy={combinedEnergy}
            beatPulse={beatPulse}
            slowRender={slowRender}
            evolveActive={!!evolveMode}
          />
          <StimulusPanel
            palette={palette}
            webcamEnabled={webcamEnabled}
            setWebcamEnabled={setWebcamEnabled}
            audioEnabled={audioEnabled}
            setAudioEnabled={setAudioEnabled}
            motionEnergy={motionEnergy}
            audioStimulus={audioStimulus}
            beatPulse={beatPulse}
            audioBands={audioBands}
            onMotion={onMotion}
            onStimulus={onStimulus}
            onBeat={onBeat}
            onFreq={onFreq}
          />
          <DavisModePanel
            palette={palette}
            evolveMode={evolveMode}
            setEvolveMode={setEvolveMode}
            evolveSource={evolveSource}
            setEvolveSource={setEvolveSource}
            evolveInterval={evolveInterval}
            setEvolveInterval={setEvolveInterval}
            slowRender={slowRender}
            setSlowRender={setSlowRender}
            audioEnabled={audioEnabled}
            onSnapshot={() => addSnapshot('png')}
            onFavorite={favoriteCurrent}
            favorites={favorites}
            recallFavorite={recallFavorite}
            removeFavorite={removeFavorite}
          />
        </div>
        {/* col 2: pool + output (browse / export) */}
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
          <OutputPanel palette={palette} layout={layoutParams} seed={seed}
            snapshots={snapshots} addSnapshot={addSnapshot}/>
        </div>
        {/* col 3: controls — router + layout */}
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
