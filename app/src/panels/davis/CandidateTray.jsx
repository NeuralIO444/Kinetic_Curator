// CandidateTray.jsx — #1507 (Explorer E3): the mined-candidate curation view.
//
// Sits beside Favorites in the DIRECTORS panel: the dice is performance-
// tempo, mining is morning-after curation (spec Q2 default). Manual
// invocation only — nothing runs on mount, on a timer, or on launch:
// the performer picks a run folder the miner (#1506) wrote and judges
// its finalists by hand. Crown writes the standard keep record through
// the SAME door a dice crown uses (Events.KEEP_ADD → addKeep → the
// shelf + the keeps ledger), carrying the candidate's provenance; pass
// writes a passes-ledger line with provenance (the X door, ADD_PASS).
// Nothing becomes a keep without the crown click (nothing-auto-saves
// law), and the look-slot gate refuses at the cap — it never evicts.
//
// Marker law: a candidate is visibly a candidate everywhere it renders —
// the MINED tag + provenance line on the card here, and the mined mark
// on its pill if it is crowned into the hits tray (FavoritesTray).
// PA4: the still is a still — no animation presents it, so what reduced
// motion shows is exactly what full motion shows.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/AppContext.jsx';
import { emit, Events } from '../../composition/eventBus.js';
import * as A from '../../state/actions.js';
import { ASSETS } from '../../data/assets/index.js';
import { PALETTES } from '../../data/palettes.js';
import { captureKeepContext } from '../../curator/keepContext.js';
import { provenanceLabel } from '../../curator/provenance.mjs';
import { parseRunFolder, crownGate } from '../../curator/candidateTray.mjs';

const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
const palettesById = new Map(PALETTES.map((p) => [p.id, p]));

const baseName = (f) => (f.webkitRelativePath || f.name).split('/').pop();

export function CandidateTray() {
  const { state, dispatch } = useApp((s) => ({ keeps: s.keeps, paletteId: s.paletteId }));
  const keeps = state.keeps || [];
  const paletteId = state.paletteId;
  const fileRef = useRef(null);
  const urlsRef = useRef([]);
  const [run, setRun] = useState(null); // parseRunFolder model
  const [stills, setStills] = useState({}); // stillBase -> object URL
  const [verdicts, setVerdicts] = useState({}); // card key -> 'crowned' | 'passed'
  const [refusal, setRefusal] = useState(null);
  const [loadNote, setLoadNote] = useState(null);

  useEffect(() => () => { for (const u of urlsRef.current) URL.revokeObjectURL(u); }, []);

  const loadRun = async (fileList) => {
    const files = new Map();
    for (const f of fileList || []) files.set(baseName(f), f);
    const readJson = async (name) => {
      const f = files.get(name);
      if (!f) return null;
      try { return JSON.parse(await f.text()); } catch { return null; }
    };
    const [runJson, finalists, candidates] = await Promise.all([
      readJson('run.json'), readJson('finalists.json'), readJson('candidates.json'),
    ]);
    if (!runJson || !Array.isArray(finalists)) {
      setLoadNote('not a run folder — run.json + finalists.json are the load');
      return;
    }
    for (const u of urlsRef.current) URL.revokeObjectURL(u);
    urlsRef.current = [];
    const model = parseRunFolder({ run: runJson, finalists, candidates: Array.isArray(candidates) ? candidates : [] });
    const stillMap = {};
    for (const card of model.cards) {
      if (!card.stillBase) continue;
      const file = files.get(`${card.stillBase}.png`) || files.get(`${card.stillBase}.svg`);
      if (file) {
        const url = URL.createObjectURL(file);
        urlsRef.current.push(url);
        stillMap[card.stillBase] = url;
      }
    }
    setRun(model);
    setStills(stillMap);
    setVerdicts({});
    setRefusal(null);
    setLoadNote(finalists.length ? null : 'that run crowned no finalists — its folder holds none');
  };

  // The record the crown/pass writes: the candidate's own composition,
  // stamped with the live session's moment (E2 left timestamps to the
  // crown act on purpose — a candidate record is timeless until judged).
  const judgedRecord = (card) => ({
    seed: card.record.seed,
    seedOffsets: { ...(card.record.seedOffsets || {}) },
    timestamp: new Date().toISOString(),
    context: captureKeepContext(paletteId),
    config: card.record.config,
    provenance: card.record.provenance,
  });

  const crown = (card) => {
    if (verdicts[card.key]) return;
    const gate = crownGate(keeps, card.record);
    if (!gate.ok) { setRefusal(gate.copy); return; }
    setRefusal(null);
    emit(Events.KEEP_ADD, { keep: judgedRecord(card) });
    setVerdicts((v) => ({ ...v, [card.key]: 'crowned' }));
  };

  const pass = (card) => {
    if (verdicts[card.key]) return;
    dispatch({ type: A.ADD_PASS, pass: judgedRecord(card) });
    setVerdicts((v) => ({ ...v, [card.key]: 'passed' }));
  };

  return (
    <div className="cand-tray">
      {/* The section label IS the collapsed tray: the load control rides
          the label row, so at rest the tray costs the panel one label
          line (the DIRECTORS no-scroll fit contract, e2e directors-duel).
          The run line, notes and cards render only once a run loads. */}
      <div className="davis-section-label ttl cand-head">
        <span>mined</span>
        <button type="button" className="micro-btn cand-load-btn" onClick={() => fileRef.current?.click()}>
          {run ? 'load another' : 'load run'}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          // webkitdirectory = pick the run folder whole; where a browser
          // ignores it, multi-file selection of the folder's contents works
          webkitdirectory=""
          style={{ display: 'none' }}
          onChange={(e) => { loadRun(e.target.files); e.target.value = ''; }}
        />
      </div>
      {run && <div className="cand-run-line">run {run.runId} · {run.cards.length} mined</div>}
      {loadNote && <div className="cand-note">{loadNote}</div>}
      {refusal && <div className="cand-refusal" role="alert">{refusal}</div>}
      {run && (
        <div className="cand-grid">
          {run.cards.map((card) => {
            const verdict = verdicts[card.key];
            const label = provenanceLabel(card.record, { assetsById, palettesById });
            const still = card.stillBase ? stills[card.stillBase] : null;
            return (
              <div key={card.key} className={`cand-card${verdict ? ` is-${verdict}` : ''}`} data-source="explorer">
                <div className="cand-still">
                  {still
                    ? <img src={still} alt={label || 'mined candidate still'} />
                    : <span className="cand-nostill">no still in folder</span>}
                  <span className="cand-tag">mined</span>
                </div>
                <div className="cand-prov">{label}</div>
                <div className="cand-meta">
                  {card.anchor ? `anchored ${card.anchor} · ` : ''}run {run.runId}
                </div>
                <div className="cand-actions">
                  {verdict
                    ? <span className="cand-verdict">{verdict}</span>
                    : (
                      <>
                        <button type="button" className="micro-btn" onClick={() => crown(card)}>crown</button>
                        <button type="button" className="micro-btn" onClick={() => pass(card)}>pass</button>
                      </>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
