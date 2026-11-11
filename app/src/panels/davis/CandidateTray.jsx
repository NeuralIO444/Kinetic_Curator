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
// law). #1589 (Keeps K1): the crown is never refused — the stage gate
// only predicts the landing. A crown that fits the stage takes a slot;
// one that doesn't lands in the collection and the tray speaks the
// line ("on the shelf — swap it in"). Nothing is evicted, ever.
//
// Marker law: a candidate is visibly a candidate everywhere it renders —
// the MINED tag + provenance line on the card here, and the mined mark
// on its pill if it is crowned into the hits tray (FavoritesTray).
// PA4: the still is a still — no animation presents it, so what reduced
// motion shows is exactly what full motion shows.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/AppContext.jsx';
import { emit, on, Events } from '../../composition/eventBus.js';
import * as A from '../../state/actions.js';
import { ASSETS } from '../../data/assets/index.js';
import { PALETTES } from '../../data/palettes.js';
import { captureKeepContext } from '../../curator/keepContext.js';
import { provenanceLabel } from '../../curator/provenance.mjs';
import { parseRunFolder, crownGate } from '../../curator/candidateTray.mjs';
import { stageRecords, ON_SHELF_COPY } from '../../curator/shelf.mjs';
import {
  ensureVisionDriver,
  getVisionView,
  subscribeVision,
  visionSurfaceOn,
} from '../../curator/megamindVisionLive.js';
import { subscribeCapabilities } from '../../composition/capabilityRegistry.mjs';

const assetsById = new Map(ASSETS.map((a) => [a.id, a]));
const palettesById = new Map(PALETTES.map((p) => [p.id, p]));

const baseName = (f) => (f.webkitRelativePath || f.name).split('/').pop();

export function CandidateTray() {
  const { state, dispatch } = useApp((s) => ({ keeps: s.keeps, keepStage: s.keepStage, paletteId: s.paletteId }));
  const keeps = state.keeps || [];
  const keepStage = state.keepStage || [];
  const paletteId = state.paletteId;
  const fileRef = useRef(null);
  const urlsRef = useRef([]);
  const runStillsRef = useRef({}); // sample index -> run.json's stills entry (sha256 + bake fingerprint)
  const featuresRef = useRef({}); // sample index -> the candidate's baked features (candidates.json)
  const [run, setRun] = useState(null); // parseRunFolder model
  const [stills, setStills] = useState({}); // stillBase -> object URL
  const [stillFiles, setStillFiles] = useState({}); // stillBase -> { file, mime } — the exact bytes (#1527)
  const [verdicts, setVerdicts] = useState({}); // card key -> 'crowned' | 'passed'
  const [line, setLine] = useState(null); // the crown landing's line (#1589: a landing, never a refusal)
  const [loadNote, setLoadNote] = useState(null);
  // #1527 (MegaMind S3): LOIS vision judging — a deliberate press, verdicts beside the rules verdict.
  const [visionDriver] = useState(() => ensureVisionDriver());
  const [vision, setVision] = useState(getVisionView);
  const [, setCapTick] = useState(0);
  useEffect(() => subscribeVision(() => setVision(getVisionView())), []);
  useEffect(() => subscribeCapabilities(() => setCapTick((t) => t + 1)), []);
  const visionOn = visionSurfaceOn('lois.vision');

  useEffect(
    () => () => {
      for (const u of urlsRef.current) URL.revokeObjectURL(u);
    },
    [],
  );

  // The load control lives on the GENERATE section's label row in
  // DavisPanel (zero added height at rest — the DIRECTORS no-scroll fit
  // contract); it asks over the bus, the tray opens its picker.
  useEffect(() => on(Events.EXPLORER_LOAD_RUN, () => fileRef.current?.click()), []);

  const loadRun = async (fileList) => {
    const files = new Map();
    for (const f of fileList || []) files.set(baseName(f), f);
    const readJson = async (name) => {
      const f = files.get(name);
      if (!f) return null;
      try {
        return JSON.parse(await f.text());
      } catch {
        return null;
      }
    };
    const [runJson, finalists, candidates] = await Promise.all([
      readJson('run.json'),
      readJson('finalists.json'),
      readJson('candidates.json'),
    ]);
    if (!runJson || !Array.isArray(finalists)) {
      setLoadNote('not a run folder — run.json + finalists.json are the load');
      return;
    }
    for (const u of urlsRef.current) URL.revokeObjectURL(u);
    urlsRef.current = [];
    const model = parseRunFolder({ run: runJson, finalists, candidates: Array.isArray(candidates) ? candidates : [] });
    const stillMap = {};
    const fileMap = {};
    for (const card of model.cards) {
      if (!card.stillBase) continue;
      const pngFile = files.get(`${card.stillBase}.png`);
      const file = pngFile || files.get(`${card.stillBase}.svg`);
      if (file) {
        const url = URL.createObjectURL(file);
        urlsRef.current.push(url);
        stillMap[card.stillBase] = url;
        // #1527: keep the file itself — the vision judge reads the exact bytes the card displays.
        fileMap[card.stillBase] = { file, mime: pngFile ? 'image/png' : 'image/svg+xml' };
      }
    }
    runStillsRef.current = {};
    for (const s of Array.isArray(runJson.stills) ? runJson.stills : []) {
      if (s && Number.isInteger(s.sample)) runStillsRef.current[s.sample] = s;
    }
    featuresRef.current = {};
    for (const c of Array.isArray(candidates) ? candidates : []) {
      if (c && Number.isInteger(c.index) && c.features) featuresRef.current[c.index] = c.features;
    }
    setRun(model);
    setStills(stillMap);
    setStillFiles(fileMap);
    setVerdicts({});
    setLine(null);
    setLoadNote(finalists.length ? null : 'that run crowned no finalists — its folder holds none');
  };

  // #1527: the judge-stills press — every finalist's displayed still goes to LOIS's vision, variant
  // cards included (those are the E5 pre-judgements, labelled as such). Verdicts land on the cards
  // BEFORE crown/pass and steer nothing: no reordering, no auto-crown, no selection change.
  const judgeStills = async () => {
    if (!run) return;
    const items = [];
    for (const card of run.cards) {
      const sf = card.stillBase ? stillFiles[card.stillBase] : null;
      if (!sf) continue;
      const stillRec = card.sampleIndex != null ? runStillsRef.current[card.sampleIndex] : null;
      const feats = card.sampleIndex != null ? featuresRef.current[card.sampleIndex] : null;
      const variant = !!card.provenance?.variants?.length;
      items.push({
        key: card.key,
        kind: variant ? 'variant' : 'render',
        bytes: new Uint8Array(await sf.file.arrayBuffer()),
        mime: sf.mime,
        seed: card.record?.seed,
        runId: run.runId,
        record: card.record,
        fingerprint: stillRec?.bakeFingerprint ?? null,
        expectedSha256: stillRec?.stillSha256 ?? null,
        facts: {
          layout: typeof card.record?.config?.layout?.mode === 'string' ? card.record.config.layout.mode : null,
          paletteId: card.record?.config?.palette?.id ?? null,
          castSize: Array.isArray(card.record?.config?.assets) ? card.record.config.assets.length : null,
          density: feats?.density ?? null,
          variant,
        },
      });
    }
    await visionDriver.judgeStills(items);
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
    // #1590: the run's Lois verdict (E4, judged at bake time) rides
    // the crown, so the fill's gate has a stored verdict to read for
    // this keep. sanitizeFavorite bounds it on the way in.
    ...(card.record.loisVerdict ? { gateVerdict: card.record.loisVerdict } : {}),
  });

  const crown = (card) => {
    if (verdicts[card.key]) return;
    // #1589: the gate reads the STAGE's records and only predicts the
    // landing — the crown always writes through the dice crown's door,
    // and the store routes it (stage slot, or collection + this line).
    const gate = crownGate(stageRecords(keeps, keepStage), card.record);
    emit(Events.KEEP_ADD, { keep: judgedRecord(card) });
    setLine(gate.ok ? null : ON_SHELF_COPY);
    setVerdicts((v) => ({ ...v, [card.key]: 'crowned' }));
  };

  const pass = (card) => {
    if (verdicts[card.key]) return;
    dispatch({ type: A.ADD_PASS, pass: judgedRecord(card) });
    setVerdicts((v) => ({ ...v, [card.key]: 'passed' }));
  };

  // At rest the tray renders only its hidden picker input — zero height.
  // The DIRECTORS panel's no-scroll fit budget belongs to the performance
  // surface; the tray's body appears once a run is loaded (curation state,
  // reached from the 'load run' control on the GENERATE label row).
  const hasBody = run || loadNote || line;
  return (
    <div className="cand-tray">
      <input
        ref={fileRef}
        type="file"
        multiple
        // webkitdirectory = pick the run folder whole; where a browser
        // ignores it, multi-file selection of the folder's contents works
        webkitdirectory=""
        style={{ display: 'none' }}
        onChange={(e) => {
          loadRun(e.target.files);
          e.target.value = '';
        }}
      />
      {hasBody && <div className="cand-body-label">mined — from the explorer</div>}
      {run && (
        <div className="cand-run-line">
          run {run.runId} · {run.cards.length} mined
        </div>
      )}
      {run && (
        <div className="cand-run-line">
          <button type="button" className="micro-btn" disabled={!visionOn || !!vision?.judging} onClick={judgeStills}>
            judge stills — LOIS vision
          </button>
          {vision?.judging ? (
            <span>
              {' '}
              judging {vision.judging.done}/{vision.judging.total}…
            </span>
          ) : !visionOn ? (
            <span> (a local vision model at tier B or better lights this up)</span>
          ) : null}
        </div>
      )}
      {run && vision && (
        <div className="cand-note">
          judge ledger: {vision.ledgerCount} vision verdict{vision.ledgerCount === 1 ? '' : 's'} accrued — a separate
          judge ledger, never taste training labels{' '}
          <button type="button" className="micro-btn" onClick={() => visionDriver.exportLedger()}>
            export judge ledger
          </button>
        </div>
      )}
      {vision?.error && <div className="cand-note">{vision.error}</div>}
      {loadNote && <div className="cand-note">{loadNote}</div>}
      {line && (
        <div className="cand-note" role="status">
          {line}
        </div>
      )}
      {run && (
        <div className="cand-grid">
          {run.cards.map((card) => {
            const verdict = verdicts[card.key];
            const label = provenanceLabel(card.record, { assetsById, palettesById });
            const still = card.stillBase ? stills[card.stillBase] : null;
            return (
              <div key={card.key} className={`cand-card${verdict ? ` is-${verdict}` : ''}`} data-source="explorer">
                <div className="cand-still">
                  {still ? (
                    <img src={still} alt={label || 'mined candidate still'} />
                  ) : (
                    <span className="cand-nostill">no still in folder</span>
                  )}
                  <span className="cand-tag">mined</span>
                  {card.provenance?.variants?.length ? (
                    <span className="cand-tag cand-tag-variant">variant</span>
                  ) : null}
                </div>
                <div className="cand-prov">{label}</div>
                <div className="cand-meta">
                  {card.anchor ? `anchored ${card.anchor} · ` : ''}run {run.runId}
                </div>
                {card.record.loisVerdict ? (
                  <div className="cand-meta">
                    rules judge (at bake): {card.record.loisVerdict.verdict} · lois-render-v1
                  </div>
                ) : null}
                {vision?.verdicts[card.key] ? (
                  <div className="cand-meta">
                    {vision.verdicts[card.key].kind === 'variant'
                      ? 'LOIS vision pre-judgement (E5)'
                      : 'LOIS vision (E4)'}
                    : {vision.verdicts[card.key].verdict} — presence {vision.verdicts[card.key].readings.presence} ·
                    contrast {vision.verdicts[card.key].readings.contrast} · exposure{' '}
                    {vision.verdicts[card.key].readings.exposure} · promise {vision.verdicts[card.key].readings.promise}
                    {vision.verdicts[card.key].line ? <div>&ldquo;{vision.verdicts[card.key].line}&rdquo;</div> : null}
                  </div>
                ) : null}
                {vision?.cardErrors[card.key] ? (
                  <div className="cand-note">vision: {vision.cardErrors[card.key]}</div>
                ) : null}
                <div className="cand-actions">
                  {verdict ? (
                    <span className="cand-verdict">{verdict}</span>
                  ) : (
                    <>
                      <button type="button" className="micro-btn" onClick={() => crown(card)}>
                        crown
                      </button>
                      <button type="button" className="micro-btn" onClick={() => pass(card)}>
                        pass
                      </button>
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
