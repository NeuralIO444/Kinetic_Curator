/**
 * WetLab.jsx — the wet lab window for one asset. #2034 (the Big Lab): the lab is a drawer-class room —
 * an icon tool rail (modes + attach tools), a centered column (shape/attach card, the creature stage,
 * the shape-fits row, the part strip), a right panel holding the active mode (ASSEMBLE / BREED / GENOME /
 * LINEAGE), and a bottom BANK rail of creature tiles. Every job the 620px popup did survives; the models,
 * the doors and the records are untouched — this is surface only.
 *
 * First tool: ATTACH points, the places on the shape where another part may join. Every asset starts with
 * points worked out from its shape (AUTO); tap the shape to add a point (up to MAX_ATTACH), and tap a point
 * to step its role — plain, H (the head), L (where a limb may grow), gone (Matt's ruled gesture, 2026-10-18:
 * one gesture, no modes — the rail's HEAD/LIMB tools only compose the same taps). One H per asset.
 *
 * The creature stage is #1872's shared CreatureMiniature, scaled up — the selected record playing live with
 * the parts Davis deals on its bones. Facts stay TE and complete (KC-1 DS rule 2): the redesign moves them
 * onto tiles, cards and the tree; standing instruction prose lives in hover help (title=), never on the wall.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { useStore } from '../state/store.js';
import { MAX_ATTACH, ATTACH_BOX, ATTACH_HIT, clickAttach } from '../engine/assetAttach.js';
import { autoAttachPoints } from '../engine/autoAttach.js';
import { emit, Events } from '../composition/eventBus.js';
import { lookName, voiceName, creatureTile, MAX_CREATURE_RECORDS } from '../engine/creatureAssembler.js'; // #1849
import { MUTATION_RATE, BREED_PARENTS } from '../engine/creatureBreed.js'; // #1852
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { ASSETS } from '../data/assets/index.js';
import { SEED_KITS, kitsById, resolveKit } from '../data/kits.js'; // #1946
import { kitDescriptors, dealableRecords } from '../state/rollPool.mjs';
import { BeastSettings } from '../components/BeastSettings.jsx';
import { GenomeTimeline } from '../components/GenomeTimeline.jsx'; // #1870
import { LineageTree } from '../components/LineageTree.jsx'; // #2030
import { CreatureCultivate } from '../components/CreatureCultivate.jsx'; // #1872
import { CreatureMiniature } from '../components/CreatureMiniature.jsx'; // #1872 — the stage is this, scaled up (#2034)
import { lineageTree } from '../components/lineageTree.model.mjs'; // #2030 — a tile's generation is derived, never stored
import { sanitizeRig } from '../engine/creatureRig.js'; // #1872 — a beast row's linkage, read for its cultivate panel
import { assemblyWarnings, keptFromWarnings, roleSetStrands } from '../components/strandBank.model.mjs'; // #1871
import { beastRows } from './beastReadoutLogic.mjs'; // #1868 — the signature readout
import { shapeCard, facetOptions, filterParents, kitBody, previewDeal } from './wetLabLogic.mjs';

const LOOKS = COMPOSITION_PRESETS.map((p) => ({ id: p.id, name: p.name }));
const VOICES = VOICE_DECK.map((v) => ({ id: v.id, name: v.def?.name ?? v.id }));
const EMPTY_SLOT = { kind: '', id: '', lookId: LOOKS[0]?.id || '', voiceId: VOICES[0]?.id || '' };

const SHAPE_PX = 256;
const genText = (gen) => (gen === null || gen === undefined ? 'gen —' : `gen ${String(gen).padStart(2, '0')}`);

/** The rail's geometric line icons (house pattern: inline SVG, currentColor). */
function RailIcon({ kind }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ display: 'block' }}>
      {kind === 'assemble' && (
        <g {...p}>
          <rect x="4" y="4" width="7" height="7" />
          <rect x="13" y="4" width="7" height="7" />
          <rect x="4" y="13" width="7" height="7" />
          <rect x="13" y="13" width="7" height="7" />
        </g>
      )}
      {kind === 'breed' && (
        <g {...p}>
          <circle cx="9" cy="12" r="5.5" />
          <circle cx="15" cy="12" r="5.5" />
        </g>
      )}
      {kind === 'genome' && <path {...p} d="M5 5v14M10 8v8M14.5 4v16M19 9v6" />}
      {kind === 'lineage' && (
        <g {...p}>
          <path d="M12 8v3M12 11l-6 3M12 11l6 3" />
          <circle cx="12" cy="5.5" r="2.4" />
          <circle cx="6" cy="16.5" r="2.4" />
          <circle cx="18" cy="16.5" r="2.4" />
        </g>
      )}
      {kind === 'point' && (
        <g {...p}>
          <rect x="5" y="5" width="14" height="14" strokeDasharray="2.5 2" />
          <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
        </g>
      )}
      {kind === 'head' && (
        <g {...p}>
          <circle cx="12" cy="7.5" r="3.4" />
          <path d="M12 11v5M7.5 20h9M12 16v4" />
        </g>
      )}
      {kind === 'limb' && (
        <g {...p}>
          <path d="M5 4l7 8 6-3" />
          <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
        </g>
      )}
      {kind === 'auto' && (
        <g {...p}>
          <path d="M19 12a7 7 0 1 1-2-4.9" />
          <path d="M17.5 2.8v4.4h-4.4" />
        </g>
      )}
      {kind === 'clear' && <path {...p} d="M6 6l12 12M18 6L6 18" />}
    </svg>
  );
}

export function WetLab({ assetId, onClose }) {
  const { assets } = useApp();
  const asset = assets.find((a) => a.id === assetId) || null;
  const own = useStore((s) => s.assetAttach?.[assetId]);
  const isOwn = Array.isArray(own); // the artist edited this asset by hand; otherwise the points come from its shape
  const autoAssetAttach = useStore((s) => s.autoAssetAttach);
  const clickAssetAttach = useStore((s) => s.clickAssetAttach);
  const assembleCreature = useStore((s) => s.assembleCreature); // #1849
  const removeCreatureRecord = useStore((s) => s.removeCreatureRecord);
  const allRecords = useStore((s) => s.creatureRecords);
  const note = useStore((s) => s.creatureAssembleNote);
  const assembleBeast = useStore((s) => s.assembleBeast); // #1962
  const beastNote = useStore((s) => s.beastAssembleNote);
  const breedCreature = useStore((s) => s.breedCreature); // #1852
  const breedNote = useStore((s) => s.creatureBreedNote);
  const [mode, setMode] = useState('assemble'); // the rail's mode: which panel the right zone holds
  const [tool, setTool] = useState('point'); // the rail's standing tool (point = the tap editor itself)
  const [selectedId, setSelectedId] = useState(''); // the record on the creature stage ('' = the default pick)
  const [cultivateOpen, setCultivateOpen] = useState(false); // #1872 — the stage card swapped for the dry-run
  const [cultivateBeastId, setCultivateBeastId] = useState(''); // #1872 — the beast tile whose cultivate panel is open
  const [slots, setSlots] = useState([EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT]);
  const [lookPick, setLookPick] = useState(''); // #1871 — the bank's Look strand ('' = dealt from the seed)
  const [voicePick, setVoicePick] = useState(''); // #1871 — the bank's Voice strand ('' = dealt from the seed)
  // a slot naming a creature that has since been removed reads as empty (never a stale id sent to BREED)
  const bankIds = new Set((allRecords || []).map((r) => r.id));
  const liveSlots = slots.map((sl) => (sl.kind === 'creature' && !bankIds.has(sl.id) ? EMPTY_SLOT : sl));
  const wrapRef = useRef(null);
  // #1946 — the descriptors the lab reads: the shape card, the breed filters, the kit source, the part preview
  const kits = useStore((s) => s.kits);
  const assetTags = useStore((s) => s.assetTags);
  const customAssets = useStore((s) => s.customAssets);
  const enabledAssets = useStore((s) => s.enabledAssets);
  const assetAttach = useStore((s) => s.assetAttach);
  const seed = useStore((s) => s.seed);
  const [tagFilter, setTagFilter] = useState(''); // 'subject:plant' — a breed-parent filter on the body's tags
  const [kitFilter, setKitFilter] = useState(''); // a kit id — bodies in its pool only
  const [kitMsg, setKitMsg] = useState(null);
  const [previewKits, setPreviewKits] = useState([]); // kit ids — "what if this stage were these kits"
  const descs = useMemo(
    () => kitDescriptors(dealableRecords(ASSETS, customAssets), { assets: ASSETS, customAssets, assetTags }),
    [customAssets, assetTags],
  );
  const beasts = useMemo(() => beastRows(customAssets), [customAssets]); // #1868
  const descById = useMemo(() => new Map(descs.map((r) => [r.id, r])), [descs]);
  const allKits = [...SEED_KITS, ...(kits || [])];

  // Subscribe ONCE, and read onClose through a ref. Escape is also the app's panic key: its handler changes the store
  // mid-event, the panel re-renders at once, and a listener that re-subscribes on every render is swapped out during
  // the very keydown it was waiting for (the first Escape would be lost).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // a creature that banks (assembled or bred) steps onto the stage — the feedback is the record itself, moving
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a freshly banked record takes the stage
    if (note && note.status === 'banked') setSelectedId(note.id);
  }, [note]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a freshly bred child takes the stage
    if (breedNote && breedNote.status === 'banked') setSelectedId(breedNote.id);
  }, [breedNote]);

  // the record on the stage: the performer's pick, else this shape's first record, else the bank's first
  const ownRecords = (allRecords || []).filter((r) => asset && r.body === asset.id);
  const selRecord =
    (allRecords || []).find((r) => r.id === selectedId) || ownRecords[0] || (allRecords || [])[0] || null;
  const selBodyAsset = selRecord ? assets.find((a) => a.id === selRecord.body) || null : null;
  const selGen = selRecord ? lineageTree(selRecord).self.gen : null;
  // the stage miniature's drawing lookup: the pool's own drawings, plus the creature tile's (its body, dressed)
  const stageSvgOf = useMemo(() => {
    if (!selRecord) return () => null;
    const byId = new Map((assets || []).map((a) => [a && a.id, a && a.svg]));
    const tile = creatureTile(selRecord, selBodyAsset || null);
    if (tile) byId.set(tile.id, tile.svg);
    return (id) => byId.get(id) || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the tile is a pure function of the record + body
  }, [assets, selRecord, selBodyAsset && selBodyAsset.id]);

  if (!asset) return null;
  const points = isOwn ? own : autoAttachPoints(asset.svg);

  const click = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;
    setTool('point');
    clickAssetAttach(
      asset.id,
      {
        x: ((e.clientX - rect.left) / rect.width) * ATTACH_BOX,
        y: ((e.clientY - rect.top) / rect.height) * ATTACH_BOX,
      },
      points,
    );
  };
  const full = points.length >= MAX_ATTACH;
  const heads = points.filter((p) => p.role === 'H').length;
  const limbCount = points.filter((p) => p.role === 'L').length;

  // the rail's editing tools: each press composes the ruled taps (engine clickAttach) — no new gesture, no modes.
  // POINT adds a plain point at the next AUTO spot the shape offers; HEAD taps the topmost plain point (→ H,
  // demoting any other H by the engine's law); LIMB taps a point until it stands at L (an H steps once, a plain
  // point twice — the same end state the tap cycle reaches).
  const tapAt = (pt, shown) => clickAssetAttach(asset.id, { x: pt.x, y: pt.y }, shown);
  const toolPoint = () => {
    setTool('point');
    if (full) return;
    const free = autoAttachPoints(asset.svg).find(
      (c) => !points.some((p) => Math.hypot(p.x - c.x, p.y - c.y) <= ATTACH_HIT),
    );
    if (free) tapAt(free, points);
  };
  const toolHead = () => {
    setTool('head');
    const plain = points.filter((p) => !p.role).sort((a, b) => a.y - b.y || a.x - b.x);
    if (plain.length) tapAt(plain[0], points);
  };
  const toolLimb = () => {
    setTool('limb');
    const target =
      points.find((p) => p.role === 'H') || points.filter((p) => !p.role).sort((a, b) => b.y - a.y || a.x - b.x)[0];
    if (!target) return;
    let shown = points;
    const steps = target.role === 'H' ? 1 : 2;
    for (let i = 0; i < steps; i++) {
      tapAt(target, shown);
      shown = clickAttach(shown, { x: target.x, y: target.y });
    }
  };

  // the stage's placed shapes, as the part preview reads them — the cultivate miniature (#1872) deals its
  // parts from the same pile, through the same contract expansion
  const stageIds = Object.keys(enabledAssets || {}).filter(
    (id) => enabledAssets[id] && id !== 'creature' && assets.some((a) => a.id === id && a.category !== 'creature'),
  );
  // #1946 — the parent pickers, filtered by the body's tags and/or a kit (assetsWhere's own answer over the bodies)
  const bodyRecs = new Map(
    (allRecords || []).filter((r) => descById.has(r.body)).map((r) => [r.body, descById.get(r.body)]),
  );
  const [tagFacet, tagTerm] = tagFilter ? tagFilter.split(':') : [null, null];
  const kitIds = kitFilter ? new Set(resolveKit(kitsById([kitFilter], kits)[0] || { where: {} }, descs).ids) : null;
  const parentList = filterParents(allRecords || [], bodyRecs, {
    facets: tagFacet ? { [tagFacet]: [tagTerm] } : null,
    kitIds,
  });
  // #1871 — the strand bank's live reading of the picks on the table: this shape's two role sets (the set in
  // use is the artist's own when one exists, else the shape's AUTO set — the attach state stays the one truth)
  // and the warnings the current combination carries. Warnings never block; assembling with them showing
  // records them on the record as kept.
  const roleSets = roleSetStrands(asset, own);
  const warnings = assemblyWarnings({ asset, points });
  const kept = keptFromWarnings(warnings);
  const card = (() => {
    const rec = descById.get(asset.id);
    return rec ? shapeCard(rec) : null;
  })();
  const attachHelp = isOwn
    ? `These are your points. ${full ? 'All four are placed: tap a point to step it — H, then L, then gone.' : 'Tap the shape to add a point where another part may join. Tap a point to step it: plain, then H (the head), then L (where a limb may grow), then gone.'}`
    : `These points were worked out from the shape. ${full ? 'All four are placed: tap a point to step it — H, then L, then gone.' : 'Tap the shape to add a point where another part may join. Tap a point to step it: plain, then H (the head), then L (where a limb may grow), then gone.'}`;

  const MODES = [
    ['assemble', 'assemble'],
    ['breed', 'breed'],
    ['genome', 'genome'],
    ['lineage', 'lineage'],
  ];

  return (
    <div style={veil} onClick={() => onClose()} role="presentation">
      <div
        style={sheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Wet lab: ${asset.id}`}
        data-testid="wet-lab"
      >
        <header style={head}>
          <span style={{ ...headSide, justifyContent: 'flex-start' }}>
            <span
              className="chip-btn"
              style={{ cursor: 'default' }}
              title="Creature records banked, of the bank's room"
            >
              {(allRecords || []).length} / {MAX_CREATURE_RECORDS}
            </span>
          </span>
          <span style={headTitle}>
            <span className="ttl" style={{ fontSize: 11 }}>
              wet lab
            </span>
            <span style={{ color: 'var(--dim)', fontSize: 9, letterSpacing: '0.06em' }}>{asset.id}</span>
          </span>
          <span style={{ ...headSide, justifyContent: 'flex-end' }}>
            <button type="button" className="chip-btn act" title="Close" onClick={onClose}>
              esc
            </button>
          </span>
        </header>
        <div style={mainRow}>
          <nav style={rail} data-testid="lab-rail" aria-label="Lab modes and attach tools">
            {MODES.map(([m, label]) => (
              <button
                key={m}
                type="button"
                style={{ ...railBtn, ...(mode === m ? railBtnOn : null) }}
                aria-pressed={mode === m}
                data-testid={`lab-mode-${m}`}
                title={`${label} panel`}
                onClick={() => setMode(m)}
              >
                <RailIcon kind={m} />
                <span style={railLbl}>{label}</span>
              </button>
            ))}
            <div style={railDiv} aria-hidden="true" />
            <button
              type="button"
              style={{ ...railBtn, ...(tool === 'point' ? railBtnOn : null) }}
              aria-pressed={tool === 'point'}
              data-testid="tool-point"
              title="Add a plain point at the next spot the shape offers (or tap the shape itself)"
              onClick={toolPoint}
            >
              <RailIcon kind="point" />
              <span style={railLbl}>point</span>
            </button>
            <button
              type="button"
              style={{ ...railBtn, ...(tool === 'head' ? railBtnOn : null) }}
              aria-pressed={tool === 'head'}
              data-testid="tool-head"
              title="Step the topmost plain point to H — the head (any other H steps back to plain)"
              onClick={toolHead}
            >
              <RailIcon kind="head" />
              <span style={railLbl}>head</span>
            </button>
            <button
              type="button"
              style={{ ...railBtn, ...(tool === 'limb' ? railBtnOn : null) }}
              aria-pressed={tool === 'limb'}
              data-testid="tool-limb"
              title="Step a point to L — where a limb may grow"
              onClick={toolLimb}
            >
              <RailIcon kind="limb" />
              <span style={railLbl}>limb</span>
            </button>
            <button
              type="button"
              style={{ ...railBtn, ...(!isOwn ? railBtnOn : null) }}
              aria-pressed={!isOwn}
              data-testid="attach-auto"
              title="Drop your edits and use the points worked out from the shape"
              onClick={() => autoAssetAttach(asset.id)}
            >
              <RailIcon kind="auto" />
              <span style={railLbl}>auto</span>
            </button>
            <button
              type="button"
              style={{ ...railBtn, ...(points.length === 0 ? railBtnDim : null) }}
              data-testid="attach-clear"
              title="No attach points on this asset"
              onClick={() => emit(Events.ATTACH_CLEAR, { assetId: asset.id })}
            >
              <RailIcon kind="clear" />
              <span style={railLbl}>clear</span>
            </button>
          </nav>
          <div style={centerCol}>
            <div style={cardBox}>
              <div style={cardHead}>
                <span style={secTitle} data-testid="attach-source">
                  <span style={caps}>
                    attach · {points.length}/{MAX_ATTACH} · {isOwn ? 'yours' : 'auto'}
                  </span>
                </span>
                <span style={{ fontSize: 10, color: 'var(--dim)' }}>
                  <span style={caps}>h</span> {heads} · <span style={caps}>l</span> {limbCount}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div
                  ref={wrapRef}
                  data-testid="wet-lab-stage"
                  onClick={click}
                  title={attachHelp}
                  style={{
                    position: 'relative',
                    width: SHAPE_PX,
                    aspectRatio: '1 / 1',
                    maxWidth: '100%',
                    cursor: 'crosshair',
                    flex: '0 0 auto',
                  }}
                >
                  <svg
                    viewBox="0 0 100 100"
                    width="100%"
                    height="100%"
                    style={{ background: '#0a0a0a', border: '1px solid var(--line)', display: 'block' }}
                    dangerouslySetInnerHTML={{ __html: asset.svg }}
                  />
                  <svg
                    viewBox="0 0 100 100"
                    width="100%"
                    height="100%"
                    aria-hidden="true"
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                  >
                    {points.map((p, i) => (
                      <g key={i} transform={`translate(${p.x} ${p.y})`} data-testid="attach-point">
                        <rect
                          x="-3"
                          y="-3"
                          width="6"
                          height="6"
                          fill="#000"
                          stroke="var(--kc-red)"
                          strokeWidth="0.8"
                          strokeDasharray={isOwn ? undefined : '1.5 1'}
                        />
                        <text y="1.6" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="var(--kc-red)">
                          {p.role || i + 1}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
              {card && (
                <div style={{ fontSize: 10, color: 'var(--dim)', lineHeight: 1.6 }} data-testid="shape-tags">
                  {card.tags.map((t) => `${t.facet}: ${t.term}`).join(' · ') || 'no tags'}
                </div>
              )}
            </div>
            {card && (
              <div style={fitsRow} data-testid="shape-card" title={card.hint ? card.hint.text : undefined}>
                {card.roles.map(({ role, fit }) => (
                  <div key={role} style={fitSeg} data-testid="shape-role">
                    <span style={{ ...caps, fontSize: 9, color: 'var(--dim)' }}>{role}</span>
                    <span style={barTrack} aria-hidden="true">
                      <span style={{ ...barFill, width: `${Math.round(fit * 100)}%` }} />
                    </span>
                    <span style={{ fontSize: 10 }}>{fit.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={cardBox} data-testid="creature-stage">
              {cultivateOpen && selRecord ? (
                <CreatureCultivate
                  key={selRecord.id}
                  subject={{
                    kind: 'record',
                    record: selRecord,
                    bodyAsset: selBodyAsset,
                  }}
                  assets={assets}
                  stageIds={stageIds}
                  overlay={customAssets}
                  seed={seed}
                />
              ) : selRecord ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <CreatureMiniature
                      subject={{ kind: 'record', record: selRecord, bodyAsset: selBodyAsset }}
                      stageIds={stageIds}
                      overlay={customAssets}
                      seed={seed}
                      svgOf={stageSvgOf}
                      size={232}
                    />
                  </div>
                  <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink)', letterSpacing: '0.06em' }}>
                    <span style={caps}>{selRecord.id}</span> · <span style={caps}>{genText(selGen)}</span> ·{' '}
                    {lookName(selRecord.look)} · {voiceName(selRecord.voice)}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--dim)', padding: '24px 0' }}>
                  <span style={caps}>no creature banked</span>
                </div>
              )}
              {selRecord && (
                <div
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}
                >
                  {selRecord.kept && selRecord.kept.length > 0 && (
                    <span
                      data-testid="record-kept"
                      title="Warnings shown at assembly and kept, recorded on the record"
                      style={{ fontSize: 10, color: 'var(--kc-red)' }}
                    >
                      ⚠ kept {selRecord.kept.length}
                    </span>
                  )}
                  {selRecord.cultivated && (
                    <span
                      data-testid="record-cultivated"
                      title={`Cultivated under seed ${selRecord.cultivated.seed} — ${selRecord.cultivated.outcome}`}
                      style={{ fontSize: 10, color: 'var(--dim)' }}
                    >
                      {selRecord.cultivated.outcome === 'stillborn' ? 'stillborn' : 'cultivated'}
                    </span>
                  )}
                  <button
                    type="button"
                    className={`chip-btn ${cultivateOpen ? 'act on' : 'act'}`}
                    aria-pressed={cultivateOpen}
                    data-testid="record-cultivate"
                    title={`Cultivate ${selRecord.id} — dry-run it before stage injection`}
                    onClick={() => setCultivateOpen((cur) => !cur)}
                  >
                    cultivate
                  </button>
                  <button
                    type="button"
                    className="chip-btn act"
                    title={`Remove ${selRecord.id}`}
                    aria-label={`Remove creature record ${selRecord.id}`}
                    onClick={() => removeCreatureRecord(selRecord.id)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
            {selRecord &&
              selBodyAsset &&
              (() => {
                const pileOnly = previewKits.length
                  ? new Set(
                      previewKits.flatMap((id) => resolveKit(kitsById([id], kits)[0] || { where: {} }, descs).ids),
                    )
                  : null;
                const parts = previewDeal(selRecord, selBodyAsset, stageIds, {
                  seed,
                  overlay: customAssets,
                  pileOnly,
                });
                return (
                  <div data-testid="part-preview" style={cardBox}>
                    <div style={{ ...secTitle, ...caps }}>parts davis would deal · {stageIds.length} on stage</div>
                    <div style={breedRow}>
                      {allKits.map((k) => {
                        const on = previewKits.includes(k.id);
                        return (
                          <button
                            key={k.id}
                            type="button"
                            className={`chip-btn ${on ? 'act on' : 'act'}`}
                            aria-pressed={on}
                            title={`Preview this stage as if it were the ${k.name} kit`}
                            onClick={() =>
                              setPreviewKits((cur) => (on ? cur.filter((x) => x !== k.id) : [...cur, k.id]))
                            }
                          >
                            {k.name}
                          </button>
                        );
                      })}
                    </div>
                    {pileOnly && !stageIds.some((id) => pileOnly.has(id)) && (
                      <div style={{ fontSize: 10, color: 'var(--dim)' }} data-testid="part-preview-note">
                        nothing on this stage is in that kit — Davis deals from the stage as it is
                      </div>
                    )}
                    <div style={stripRow} data-testid="part-strip">
                      {parts.map((p) => {
                        const part = assets.find((a) => a.id === p.asset);
                        return (
                          <div key={p.bone} style={partCell} data-testid="part-cell" title={`${p.bone} ← ${p.asset}`}>
                            <svg
                              viewBox="0 0 100 100"
                              width="36"
                              height="36"
                              style={{ background: '#0a0a0a', border: '1px solid var(--line)' }}
                              dangerouslySetInnerHTML={{ __html: part ? part.svg : '' }}
                            />
                            <span style={{ ...lower, fontSize: 9 }}>{p.bone}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
          </div>
          <aside style={rightPanel}>
            {mode === 'assemble' && (
              <div style={panelCol}>
                {/* #1871 — the strand bank: the assembler rebuilt around named strands. The body is this shape
                    (strand asset:<id>); its role set is the shape's AUTO set or the artist's own (strands
                    points:auto:<id> / points:own:<id>); Look and Voice are picked by name or dealt from the seed.
                    Discrete state → TE readout (DS rule 2). Warnings show in the open and never block; assembling
                    with them showing keeps them on the record. */}
                <div style={{ ...secTitle, ...caps }} data-testid="assemble-title">
                  strand bank · creature · h {heads} · l {limbCount} · {(allRecords || []).length}/
                  {MAX_CREATURE_RECORDS}
                </div>
                <div style={strandCard} data-testid="strand-body">
                  <svg
                    viewBox="0 0 100 100"
                    width="52"
                    height="52"
                    style={{ background: '#0a0a0a', border: '1px solid var(--line)', flex: '0 0 auto' }}
                    dangerouslySetInnerHTML={{ __html: asset.svg }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ ...caps, fontSize: 9, color: 'var(--dim)' }}>body</span>
                    <span style={{ color: 'var(--ink)', fontSize: 11 }}>{asset.id}</span>
                    <span style={{ fontSize: 9 }}>asset:{asset.id}</span>
                  </span>
                </div>
                <div style={strandCard} data-testid="strand-points">
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: '1 1 auto' }}>
                    <span style={{ ...caps, fontSize: 9, color: 'var(--dim)' }}>points</span>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        className={`chip-btn act${isOwn ? '' : ' on'}`}
                        aria-pressed={!isOwn}
                        data-testid="strand-points-auto"
                        title="Use the role set worked out from the shape"
                        onClick={() => autoAssetAttach(asset.id)}
                      >
                        auto · h {roleSets.auto ? roleSets.auto.counts.heads : 0} · l{' '}
                        {roleSets.auto ? roleSets.auto.counts.limbs : 0}
                      </button>
                      {roleSets.own ? (
                        <span
                          data-testid="strand-points-own"
                          style={{ color: 'var(--ink)' }}
                          title="Your hand-edited role set — the set in use"
                        >
                          yours · h {roleSets.own.counts.heads} · l {roleSets.own.counts.limbs} · in use
                        </span>
                      ) : (
                        <span title="Click the shape to edit its points by hand">yours · —</span>
                      )}
                    </span>
                    <span style={{ fontSize: 9 }}>
                      {isOwn && roleSets.own ? roleSets.own.id : roleSets.auto ? roleSets.auto.id : ''}
                    </span>
                  </span>
                </div>
                <div style={strandCard}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: '1 1 auto' }}>
                    <span style={{ ...caps, fontSize: 9, color: 'var(--dim)' }}>look</span>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        aria-label="Look strand"
                        data-testid="strand-look"
                        value={lookPick}
                        onChange={(e) => setLookPick(e.target.value)}
                      >
                        <option value="">dealt from the seed</option>
                        {LOOKS.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: 9 }}>{lookPick ? `look:${lookPick}` : 'dealt'}</span>
                    </span>
                  </span>
                </div>
                <div style={strandCard}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: '1 1 auto' }}>
                    <span style={{ ...caps, fontSize: 9, color: 'var(--dim)' }}>voice</span>
                    <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        aria-label="Voice strand"
                        data-testid="strand-voice"
                        value={voicePick}
                        onChange={(e) => setVoicePick(e.target.value)}
                      >
                        <option value="">dealt from the seed</option>
                        {VOICES.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                      <span style={{ fontSize: 9 }}>{voicePick ? `voice:${voicePick}` : 'dealt'}</span>
                    </span>
                  </span>
                </div>
                {warnings.length > 0 && (
                  <div style={warnBanner} data-testid="strand-warnings">
                    {warnings.map((w) => (
                      <div
                        key={w.id}
                        style={{ fontSize: 11, color: 'var(--kc-red)', lineHeight: 1.5 }}
                        data-testid="strand-warning"
                      >
                        ⚠ {w.what} — {w.why}
                        {w.cost ? ` · cost ${w.cost.score}, over the line ${w.cost.threshold}` : ''}
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="chip-btn act"
                  data-testid="assemble"
                  style={{ width: '100%', height: 34, fontSize: 11 }}
                  title="Assemble a creature record from the picked strands, dealt off the project seed"
                  onClick={() =>
                    assembleCreature(asset.id, points, {
                      lookId: lookPick || null,
                      voiceId: voicePick || null,
                      kept,
                    })
                  }
                >
                  {warnings.length > 0
                    ? `assemble — keep ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`
                    : 'assemble'}
                </button>
                {/* what the press did, announced politely: never a silent no-op or a silent eviction */}
                <span
                  style={{ ...noteText, alignSelf: 'flex-start' }}
                  role="status"
                  aria-live="polite"
                  data-testid="assemble-note"
                >
                  {note && note.status === 'banked' && `banked ${note.id} — its tile is in the asset pool`}
                  {note && note.status === 'already' && `already banked ${note.id}`}
                  {note && note.status === 'full' && `bank full (${MAX_CREATURE_RECORDS}) — remove one first`}
                  {note &&
                    note.status === 'pool-full' &&
                    'the asset pool is full — remove an import or a creature first'}
                  {note && note.status === 'nobody' && 'this shape cannot be drawn as a body'}
                  {note && note.status === 'restored' && `${note.id}'s tile was missing — it is back in the asset pool`}
                  {note &&
                    note.status === 'redrawn' &&
                    `${note.id}'s tile redrawn from its body — its limbs and head move`}
                  {note &&
                    note.status === 'id-taken' &&
                    'an import already uses this creature’s pool id — rename that import first'}
                </span>
                {/* #1962 — a Strandbeest needs no shape: its linkage is the skeleton. The bank rail's + BEAST tile
                    deals the next animal off the project seed (inside the S2 gate) and banks it as a pool tile;
                    its settings and signature rows live here, beside the press's note. */}
                <div style={{ ...secTitle, ...caps, marginTop: 6 }}>beast</div>
                <span
                  style={{ ...noteText, alignSelf: 'flex-start' }}
                  role="status"
                  aria-live="polite"
                  data-testid="beast-note"
                >
                  {beastNote &&
                    beastNote.status === 'banked' &&
                    `banked ${beastNote.id} — its tile is in the asset pool`}
                  {beastNote && beastNote.status === 'pool-full' && 'the asset pool is full — remove an import first'}
                  {beastNote && beastNote.status === 'nobody' && 'no new beast could be dealt on this seed'}
                </span>
                <BeastSettings />
                {/* #1868 — the family-resemblance readout: each beast's foot-path signature, the solver's own curve, drawn to one
                    frame with its nearest relative's (dim) so a mutation's kink is something the eye judges. Inspection
                    surface only: the stage is never annotated. */}
                {beasts.length > 0 && (
                  <ul style={recList} data-testid="beast-rows">
                    {beasts.map((b) => (
                      <li key={b.id} style={{ ...recRow, alignItems: 'center', gap: 8 }} data-testid="beast-row">
                        <svg
                          width="132"
                          height="72"
                          viewBox="0 0 132 72"
                          role="img"
                          aria-label={`foot-path signature of ${b.id}`}
                          data-testid="beast-signature"
                          style={{ flex: '0 0 auto', maxWidth: '100%' }}
                        >
                          {b.kin && (
                            <path d={b.kin.path} fill="none" stroke="var(--dim)" strokeWidth="1" opacity="0.6" />
                          )}
                          <path d={b.path} fill="none" stroke="var(--ink)" strokeWidth="1.6" />
                        </svg>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{b.id}</span>
                          <span style={caps}>
                            {b.legs} legs · scale {b.scale}
                          </span>
                          <span style={noteText} data-testid="beast-kin">
                            {b.kin ? `${b.kin.label} ${b.kin.distance} · ${b.kin.id}` : 'no relative yet'}
                          </span>
                        </span>
                        <button
                          type="button"
                          className={`chip-btn ${cultivateBeastId === b.id ? 'act on' : 'act'}`}
                          aria-pressed={cultivateBeastId === b.id}
                          data-testid="beast-cultivate"
                          title={`Cultivate ${b.id} — watch its gait sweep and read the linkage gate’s verdict`}
                          onClick={() => setCultivateBeastId((cur) => (cur === b.id ? '' : b.id))}
                        >
                          cultivate
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {/* #1872 — CULTIVATE for a beast: the solver's gait sweep playing live and the linkage gate's
                    verdict, derived from the tile's measures. A beast's tile keeps no cultivation note (its
                    door carries no such field), so the reads are live and nothing is written. */}
                {(() => {
                  if (!cultivateBeastId) return null;
                  const tile = (customAssets || []).find((a) => a && a.id === cultivateBeastId);
                  const rig = tile ? sanitizeRig(tile.rig) : null;
                  if (!rig || !rig.linkage) return null;
                  return (
                    <CreatureCultivate
                      key={tile.id}
                      subject={{ kind: 'linkage', id: tile.id, measures: rig.linkage.measures }}
                    />
                  );
                })()}
              </div>
            )}
            {mode === 'breed' && (
              <div style={panelCol}>
                {/* #1852 — BREED: three sources → one child (Matt: "taking 3 artists style to get something new"). A source
                    is a banked creature, or this shape wearing a Look and a Voice — never a stage. Discrete genes pick a
                    parent, continuous ones blend, ~1 gene in 8 mutates, and the child names its parents. */}
                <div style={{ ...secTitle, ...caps }} data-testid="breed-title">
                  breed · {BREED_PARENTS} sources · mutation 1/{Math.round(1 / MUTATION_RATE)}
                </div>
                {/* #1946 — group the banked parents by their BODY's tags, or by a kit: exactly the pool panel's filter */}
                <div style={breedRow} data-testid="breed-filters">
                  <span style={caps}>filter parents</span>
                  <select
                    aria-label="Filter parents by body tag"
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                  >
                    <option value="">any tag</option>
                    {facetOptions([...bodyRecs.values()]).map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.facet}: {o.term}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter parents by kit"
                    value={kitFilter}
                    onChange={(e) => setKitFilter(e.target.value)}
                  >
                    <option value="">any kit</option>
                    {allKits.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="breed-slots">
                  {liveSlots.map((slot, i) => {
                    const setSlot = (patch) =>
                      setSlots((cur) => cur.map((s2, j) => (j === i ? { ...s2, ...patch } : s2)));
                    const value =
                      slot.kind === 'assembly'
                        ? '@shape'
                        : slot.kind === 'kit'
                          ? `@kit:${slot.kitId}`
                          : slot.kind === 'creature'
                            ? slot.id
                            : '';
                    const parentRec =
                      slot.kind === 'creature' ? (allRecords || []).find((r) => r.id === slot.id) : null;
                    const slotBodyAsset =
                      slot.kind === 'assembly'
                        ? asset
                        : parentRec
                          ? assets.find((a) => a.id === parentRec.body) || null
                          : null;
                    const slotKit = slot.kind === 'kit' ? allKits.find((k) => k.id === slot.kitId) : null;
                    return (
                      <div key={i} style={slotCard} data-testid="breed-slot">
                        <div style={slotTop}>
                          <span style={slotBox} aria-hidden="true">
                            {slotBodyAsset ? (
                              <svg
                                viewBox="0 0 100 100"
                                width="56"
                                height="56"
                                style={{ display: 'block' }}
                                dangerouslySetInnerHTML={{ __html: slotBodyAsset.svg }}
                              />
                            ) : slotKit ? (
                              <span className="name" style={{ fontSize: 9, color: 'var(--ink)', textAlign: 'center' }}>
                                {slotKit.name}
                              </span>
                            ) : (
                              <span style={{ fontSize: 18, color: 'var(--dim)' }}>+</span>
                            )}
                          </span>
                          <span style={{ ...caps, fontSize: 9, color: 'var(--dim)' }}>parent {i + 1}</span>
                        </div>
                        <select
                          aria-label={`Parent ${i + 1}`}
                          value={value}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '@shape') setSlot({ kind: 'assembly' });
                            else if (v.startsWith('@kit:')) setSlot({ kind: 'kit', kitId: v.slice(5) });
                            else if (v) setSlot({ kind: 'creature', id: v });
                            else setSlot({ kind: '', id: '' });
                          }}
                        >
                          <option value="">pick a parent</option>
                          <option value="@shape">this shape · {asset.id}</option>
                          <optgroup label="a kit supplies the body">
                            {allKits.map((k) => (
                              <option key={k.id} value={`@kit:${k.id}`}>
                                kit · {k.name}
                              </option>
                            ))}
                          </optgroup>
                          {parentList.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.id} · {lookName(r.look)} · {voiceName(r.voice)}
                              {r.lineage ? ' · bred' : ''}
                            </option>
                          ))}
                          {slot.kind === 'creature' && !parentList.some((r) => r.id === slot.id) && (
                            <option value={slot.id}>{slot.id} · filtered out</option>
                          )}
                        </select>
                        {(slot.kind === 'assembly' || slot.kind === 'kit') && (
                          <>
                            <select
                              aria-label={`Parent ${i + 1} look`}
                              value={slot.lookId}
                              onChange={(e) => setSlot({ lookId: e.target.value })}
                            >
                              {LOOKS.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                            </select>
                            <select
                              aria-label={`Parent ${i + 1} voice`}
                              value={slot.voiceId}
                              onChange={(e) => setSlot({ voiceId: e.target.value })}
                            >
                              {VOICES.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const child = breedNote && (allRecords || []).find((r) => r.id === breedNote.id && r.lineage);
                  const childBody = child ? assets.find((a) => a.id === child.body) || null : null;
                  return (
                    <div style={slotCard} data-testid="breed-child">
                      <div style={slotTop}>
                        <span style={{ ...slotBox, borderStyle: 'dashed' }} aria-hidden="true">
                          {child && childBody ? (
                            <svg
                              viewBox="0 0 100 100"
                              width="56"
                              height="56"
                              style={{ display: 'block' }}
                              dangerouslySetInnerHTML={{ __html: childBody.svg }}
                            />
                          ) : (
                            <span style={{ fontSize: 18, color: 'var(--dim)' }}>—</span>
                          )}
                        </span>
                        <span style={{ ...caps, fontSize: 9, color: 'var(--dim)' }}>
                          child{child ? ` · ${child.id}` : ''}
                        </span>
                      </div>
                      {child && (
                        <div style={{ fontSize: 10, color: 'var(--dim)', lineHeight: 1.6 }} data-testid="breed-lineage">
                          {child.id} ← {child.lineage.parents.join(' · ')} · {child.lineage.mutations.length} mutation
                          {child.lineage.mutations.length === 1 ? '' : 's'}
                          {child.lineage.mutations.map((m) => (
                            <div key={`${m.gene}-${m.kind}`}>
                              <span style={lower}>{m.gene}</span> {m.kind === 'swap' ? `from ${m.to}` : `→ ${m.value}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <button
                  type="button"
                  className="chip-btn act"
                  data-testid="breed"
                  style={{ width: '100%', height: 34, fontSize: 11 }}
                  title="Breed a child from the three parents, dealt off the project seed"
                  onClick={() => {
                    // a kit slot becomes an assembly of the body the kit supplies (by role fit, off the project seed)
                    const sources = [];
                    setKitMsg(null);
                    for (const sl of liveSlots) {
                      if (sl.kind === 'kit') {
                        const kit = kitsById([sl.kitId], kits)[0];
                        const bodyId = kit && kitBody(kit, seed, descs);
                        const bodyAsset = bodyId && ASSETS.find((a) => a.id === bodyId);
                        if (!bodyAsset) {
                          setKitMsg(`the ${kit ? kit.name : sl.kitId} kit has no shape to be a body`);
                          return;
                        }
                        const pts = Array.isArray(assetAttach?.[bodyId])
                          ? assetAttach[bodyId]
                          : autoAttachPoints(bodyAsset.svg);
                        sources.push({
                          kind: 'assembly',
                          assetId: bodyId,
                          points: pts,
                          lookId: sl.lookId,
                          voiceId: sl.voiceId,
                        });
                      } else if (sl.kind === 'assembly') {
                        sources.push({
                          kind: 'assembly',
                          assetId: asset.id,
                          points,
                          lookId: sl.lookId,
                          voiceId: sl.voiceId,
                        });
                      } else sources.push({ kind: sl.kind, id: sl.id });
                    }
                    breedCreature(sources);
                  }}
                >
                  breed
                </button>
                <span
                  style={{ ...noteText, alignSelf: 'flex-start' }}
                  role="status"
                  aria-live="polite"
                  data-testid="breed-note"
                >
                  {kitMsg}
                  {!kitMsg && breedNote && breedNote.status === 'need-three' && 'pick three different parents'}
                  {breedNote &&
                    breedNote.status === 'same-parent' &&
                    'two of the three are the same creature — this shape in that Look and Voice is already banked'}
                  {breedNote && breedNote.status === 'banked' && `bred ${breedNote.id} — its tile is in the asset pool`}
                  {breedNote && breedNote.status === 'already' && `already bred ${breedNote.id}`}
                  {breedNote && breedNote.status === 'full' && `bank full (${MAX_CREATURE_RECORDS}) — remove one first`}
                  {breedNote &&
                    breedNote.status === 'pool-full' &&
                    'the asset pool is full — remove an import or a creature first'}
                  {breedNote && breedNote.status === 'nobody' && 'the child’s body cannot be drawn'}
                  {breedNote && breedNote.status === 'id-taken' && 'an import already uses the child’s pool id'}
                  {breedNote &&
                    (breedNote.status === 'restored' || breedNote.status === 'redrawn') &&
                    `${breedNote.id}’s tile is back in the asset pool`}
                </span>
              </div>
            )}
            {mode === 'genome' &&
              (selRecord ? (
                /* #1870 — the Genome Timeline: the selected record's genes as tiles (one node per gene, in record
                   order) with inspect / mutate / replace. It follows the RECORD on the stage, and the strip reads
                   the record alone — a hand edit that changes its body does not close its own surface. */
                <GenomeTimeline
                  key={selRecord.id}
                  record={selRecord}
                  donors={(allRecords || []).filter((r) => r.id !== selRecord.id)}
                  legalBodies={assets.filter((a) => a.category !== 'creature').map((a) => a.id)}
                  hasBodyPoints={assets.some((a) => a.id === selRecord.body)}
                />
              ) : (
                <div style={panelCol}>
                  <span style={{ ...caps, fontSize: 10, color: 'var(--dim)' }}>no creature banked</span>
                </div>
              ))}
            {mode === 'lineage' &&
              (selRecord ? (
                /* #2030 — the Lineage Tree: the selected record's retained ancestry as a drawn pedigree with
                   per-node deltas. Like the strip, it follows the RECORD on the stage, and it reads the record
                   alone — never the bank — so a relative's later edits or removal cannot rewrite it. */
                <LineageTree key={selRecord.id} record={selRecord} assets={assets} />
              ) : (
                <div style={panelCol}>
                  <span style={{ ...caps, fontSize: 10, color: 'var(--dim)' }}>no creature banked</span>
                </div>
              ))}
          </aside>
        </div>
        <footer style={bankRail} data-testid="bank-rail">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '0 0 auto' }}>
            <span className="ttl" style={{ fontSize: 10 }}>
              bank
            </span>
            <span style={{ fontSize: 9, color: 'var(--dim)' }}>
              {(allRecords || []).length} / {MAX_CREATURE_RECORDS}
            </span>
          </span>
          <div style={bankScroll}>
            <div style={bankRow}>
              {(allRecords || []).map((r) => {
                const bodyA = assets.find((a) => a.id === r.body) || null;
                const gen = lineageTree(r).self.gen;
                const sel = selRecord && selRecord.id === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    style={{ ...bankTile, ...(sel ? bankTileSel : null) }}
                    aria-pressed={!!sel}
                    data-testid="bank-tile"
                    title={`${r.id} · ${genText(gen)} · ${lookName(r.look)} · ${voiceName(r.voice)}`}
                    onClick={() => {
                      setSelectedId(r.id);
                      setCultivateOpen(false);
                    }}
                  >
                    <span style={genChip}>{gen === null ? '—' : String(gen).padStart(2, '0')}</span>
                    {r.kept && r.kept.length > 0 && (
                      <span style={keptGlyph} title={`kept ${r.kept.length} warning${r.kept.length === 1 ? '' : 's'}`}>
                        ⚠{r.kept.length}
                      </span>
                    )}
                    {bodyA ? (
                      <svg
                        viewBox="0 0 100 100"
                        width="44"
                        height="44"
                        style={{ display: 'block', margin: '0 auto' }}
                        dangerouslySetInnerHTML={{ __html: bodyA.svg }}
                      />
                    ) : (
                      <span style={{ display: 'block', height: 44, lineHeight: '44px', color: 'var(--dim)' }}>—</span>
                    )}
                    <span style={bankTileId}>{r.id}</span>
                  </button>
                );
              })}
              <button
                type="button"
                style={{ ...bankTile, borderStyle: 'dashed' }}
                data-testid="assemble-beast"
                title="Deal the next Strandbeest off the project seed and add its tile to the asset pool"
                onClick={() => assembleBeast()}
              >
                <span style={{ display: 'block', fontSize: 22, lineHeight: '44px', color: 'var(--ink)' }}>+</span>
                <span style={{ ...bankTileId, ...caps }}>beast</span>
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

const veil = {
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const sheet = {
  width: 1180,
  maxWidth: '96vw',
  maxHeight: '90vh',
  background: 'var(--bg, #111)',
  border: '1px solid var(--line)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  display: 'flex',
  flexDirection: 'column',
};
const head = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderBottom: '1px solid var(--line)',
  fontSize: 10,
  flex: '0 0 auto',
};
const headSide = { flex: '1 1 0', display: 'flex', alignItems: 'center' };
const headTitle = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flex: '0 0 auto' };
const mainRow = {
  display: 'flex',
  flexWrap: 'wrap',
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  alignItems: 'stretch',
};
const rail = {
  width: 60,
  flex: '0 0 60px',
  borderRight: '1px solid var(--line)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '8px 0',
  gap: 4,
};
const railBtn = {
  width: 52,
  padding: '6px 0 5px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 3,
  background: 'transparent',
  border: 'none',
  color: 'var(--dim)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const railBtnOn = { color: 'var(--kc-red)' };
const railBtnDim = { opacity: 0.45 };
const railLbl = { fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase' };
const railDiv = { width: 32, borderTop: '1px solid var(--line)', margin: '6px 0' };
const centerCol = {
  flex: '1 1 300px',
  minWidth: 260,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 12,
  minHeight: 0,
};
const rightPanel = {
  flex: '1 1 340px',
  maxWidth: 380,
  minWidth: 280,
  borderLeft: '1px solid var(--line)',
  padding: 12,
  minHeight: 0,
};
const panelCol = { display: 'flex', flexDirection: 'column', gap: 8 };
const cardHead = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const fitsRow = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px 14px',
  padding: '6px 8px',
  border: '1px solid var(--line)',
  alignItems: 'center',
};
const fitSeg = { display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 100px', minWidth: 100 };
const strandCard = {
  display: 'flex',
  gap: 8,
  padding: 8,
  border: '1px solid var(--line)',
  fontSize: 10,
  color: 'var(--dim)',
  alignItems: 'center',
};
const warnBanner = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: 8,
  border: '1px solid var(--kc-red)',
};
const slotCard = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 8,
  border: '1px solid var(--line)',
  fontSize: 10,
  color: 'var(--dim)',
};
const slotTop = { display: 'flex', alignItems: 'center', gap: 8 };
const slotBox = {
  width: 60,
  height: 60,
  flex: '0 0 auto',
  border: '1px solid var(--line)',
  background: '#0a0a0a',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
};
const bankRail = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  borderTop: '1px solid var(--line)',
  flex: '0 0 auto',
};
const bankScroll = { flex: '1 1 auto', minWidth: 0, overflowX: 'auto' };
const bankRow = { display: 'flex', gap: 6, width: 'max-content', margin: '0 auto', padding: '2px 0' };
const bankTile = {
  position: 'relative',
  width: 76,
  padding: '4px 2px 3px',
  background: 'transparent',
  border: '1px solid var(--line)',
  color: 'var(--dim)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  flex: '0 0 auto',
};
const bankTileSel = { borderColor: 'var(--kc-red)', outline: '1px solid var(--kc-red)', color: 'var(--ink)' };
const bankTileId = {
  display: 'block',
  fontSize: 8.5,
  letterSpacing: '0.04em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  marginTop: 2,
};
const genChip = {
  position: 'absolute',
  top: 2,
  left: 2,
  fontSize: 8,
  lineHeight: 1,
  padding: '2px 3px',
  background: '#000',
  border: '1px solid var(--line)',
  color: 'var(--ink)',
  letterSpacing: '0.06em',
};
const keptGlyph = {
  position: 'absolute',
  top: 2,
  right: 2,
  fontSize: 8,
  lineHeight: 1,
  padding: '2px 3px',
  background: '#000',
  border: '1px solid var(--line)',
  color: 'var(--kc-red)',
};
const secTitle = { fontSize: 9, letterSpacing: '0.14em', fontWeight: 700, color: 'var(--dim)' };
const recList = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 };
const recRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 10,
  color: 'var(--dim)',
  letterSpacing: '0.06em',
  borderTop: '1px solid var(--line)',
  paddingTop: 4,
  // rows carry more chips than the panel is wide (cultivate, ✕): the row wraps rather than pushing the
  // sheet into a horizontal scroll (the e2e no-overflow pin)
  flexWrap: 'wrap',
};
const breedRow = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--dim)', flexWrap: 'wrap' };
const cardBox = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 8,
  border: '1px solid var(--line)',
  fontSize: 10,
  color: 'var(--dim)',
};
const barTrack = { flex: '1 1 auto', height: 6, background: 'rgba(255,255,255,0.08)', display: 'block', minWidth: 24 };
const barFill = { display: 'block', height: '100%', background: 'var(--kc-red)' };
const stripRow = { display: 'flex', flexWrap: 'wrap', gap: 6 };
const partCell = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 };
const caps = { textTransform: 'uppercase' };
const lower = { textTransform: 'lowercase' }; // DS §5: casing lives in style, JSX stays lowercase
const noteText = { fontSize: 10, color: 'var(--dim)', alignSelf: 'center', letterSpacing: '0.06em' };
