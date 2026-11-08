/**
 * WetLab.jsx — #1355 Phase 3: the wet lab window for one asset. First tool: ATTACH points, the places on the shape
 * where another part may join. Every asset starts with points worked out from its shape (AUTO); click the shape to
 * add a point (up to MAX_ATTACH), and click a point to step its role — plain, H (the head), L (where a limb may
 * grow), gone (#1634; one H per asset) — and the asset uses yours from then on.
 * Same popup shell as RegionPicker. The window is where the asset's creature settings will grow.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { useStore } from '../state/store.js';
import { MAX_ATTACH, ATTACH_BOX } from '../engine/assetAttach.js';
import { autoAttachPoints } from '../engine/autoAttach.js';
import { emit, Events } from '../composition/eventBus.js';
import { lookName, voiceName, MAX_CREATURE_RECORDS } from '../engine/creatureAssembler.js'; // #1849
import { MUTATION_RATE, BREED_PARENTS } from '../engine/creatureBreed.js'; // #1852
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { ASSETS } from '../data/assets/index.js';
import { SEED_KITS, kitsById, resolveKit } from '../data/kits.js'; // #1946
import { kitDescriptors, dealableRecords } from '../state/rollPool.mjs';
import { BeastSettings } from '../components/BeastSettings.jsx';
import { GenomeTimeline } from '../components/GenomeTimeline.jsx'; // #1870
import { beastRows } from './beastReadoutLogic.mjs'; // #1868 — the signature readout
import { shapeCard, facetOptions, filterParents, kitBody, previewDeal } from './wetLabLogic.mjs';

const LOOKS = COMPOSITION_PRESETS.map((p) => ({ id: p.id, name: p.name }));
const VOICES = VOICE_DECK.map((v) => ({ id: v.id, name: v.def?.name ?? v.id }));
const EMPTY_SLOT = { kind: '', id: '', lookId: LOOKS[0]?.id || '', voiceId: VOICES[0]?.id || '' };

const PREVIEW_PX = 320;

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
  const [slots, setSlots] = useState([EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT]);
  const [genomeId, setGenomeId] = useState(''); // #1870 — the record whose genome timeline is open ('' = none)
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
  const [previewId, setPreviewId] = useState('');
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

  if (!asset) return null;
  const points = isOwn ? own : autoAttachPoints(asset.svg);

  const click = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return;
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
  // #1849 — this asset's assembled records (the body is this shape). Data only: no stage reads them yet.
  const records = (allRecords || []).filter((r) => r.body === asset.id);
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
  const heads = points.filter((p) => p.role === 'H').length;
  const limbCount = points.filter((p) => p.role === 'L').length;

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
          <span className="ttl">wet lab</span>
          <span style={{ color: 'var(--dim)', fontSize: 9, flex: 1 }}>{asset.id}</span>
          <button type="button" className="chip-btn act" title="Close" onClick={onClose}>
            esc
          </button>
        </header>
        <div style={body}>
          <div
            ref={wrapRef}
            data-testid="wet-lab-stage"
            onClick={click}
            style={{
              position: 'relative',
              width: PREVIEW_PX,
              height: PREVIEW_PX,
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
          <div style={{ flex: '1 1 auto', minWidth: 160, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(() => {
              const rec = descById.get(asset.id);
              if (!rec) return null;
              const card = shapeCard(rec);
              return (
                <div data-testid="shape-card" style={cardBox}>
                  <div style={{ ...secTitle, ...caps }}>this shape is good for</div>
                  {card.roles.map(({ role, fit }) => (
                    <div key={role} style={barRow} data-testid="shape-role">
                      <span style={{ ...caps, width: 52 }}>{role}</span>
                      <span style={barTrack} aria-hidden="true">
                        <span style={{ ...barFill, width: `${Math.round(fit * 100)}%` }} />
                      </span>
                      <span style={{ width: 28, textAlign: 'right' }}>{fit.toFixed(2)}</span>
                    </div>
                  ))}
                  {card.hint && (
                    <div style={{ fontSize: 11, color: 'var(--ink)' }} data-testid="shape-hint">
                      {card.hint.text}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--dim)', lineHeight: 1.6 }} data-testid="shape-tags">
                    {card.tags.map((t) => `${t.facet}: ${t.term}`).join(' · ') || 'no tags'}
                  </div>
                </div>
              );
            })()}
            <div style={secTitle} data-testid="attach-source">
              ATTACH · {points.length}/{MAX_ATTACH} · {isOwn ? 'YOURS' : 'AUTO'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>
              {isOwn ? 'These are your points.' : 'These points were worked out from the shape.'}{' '}
              {full
                ? 'All four are placed: click a point to step it — H, then L, then gone.'
                : 'Click the shape to add a point where another part may join. Click a point to step it: plain, then H (the head), then L (where a limb may grow), then gone.'}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {isOwn && (
                <button
                  type="button"
                  className="chip-btn act"
                  data-testid="attach-auto"
                  title="Drop your edits and use the points worked out from the shape"
                  onClick={() => autoAssetAttach(asset.id)}
                >
                  auto
                </button>
              )}
              {points.length > 0 && (
                <button
                  type="button"
                  className="chip-btn act"
                  data-testid="attach-clear"
                  title="No attach points on this asset"
                  onClick={() => emit(Events.ATTACH_CLEAR, { assetId: asset.id })}
                >
                  clear points
                </button>
              )}
            </div>
            {/* #1849 — the assembler: this shape + its points → a creature record (body, head, limbs, empty drive
                slots, a Look and a Voice, and a genome). Discrete state → TE readout (DS rule 2). */}
            <div style={{ ...secTitle, ...caps, marginTop: 6 }} data-testid="assemble-title">
              creature · h {heads} · l {limbCount} · {(allRecords || []).length}/{MAX_CREATURE_RECORDS}
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>
              Assemble a creature from this shape: the H point is its head, the L points its limbs. It joins the asset
              pool as a creature tile — turn it on there and the stage places it like any shape.
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="chip-btn act"
                data-testid="assemble"
                title="Assemble a creature record from this shape and its points, dealt off the project seed"
                onClick={() => assembleCreature(asset.id, points)}
              >
                assemble
              </button>
              {/* what the press did, announced politely: never a silent no-op or a silent eviction */}
              <span style={{ ...noteText }} role="status" aria-live="polite" data-testid="assemble-note">
                {note && note.status === 'banked' && `banked ${note.id} — its tile is in the asset pool`}
                {note && note.status === 'already' && `already banked ${note.id}`}
                {note && note.status === 'full' && `bank full (${MAX_CREATURE_RECORDS}) — remove one first`}
                {note && note.status === 'pool-full' && 'the asset pool is full — remove an import or a creature first'}
                {note && note.status === 'nobody' && 'this shape cannot be drawn as a body'}
                {note && note.status === 'restored' && `${note.id}'s tile was missing — it is back in the asset pool`}
                {note &&
                  note.status === 'redrawn' &&
                  `${note.id}'s tile redrawn from its body — its limbs and head move`}
                {note &&
                  note.status === 'id-taken' &&
                  'an import already uses this creature’s pool id — rename that import first'}
              </span>
            </div>
            {/* #1962 — a Strandbeest needs no shape: its linkage is the skeleton. One press deals the next animal off the
                project seed (inside the S2 gate) and banks it as a pool tile; the stage hangs its parts on the bars. */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              <button
                type="button"
                className="chip-btn act"
                data-testid="assemble-beast"
                title="Deal the next Strandbeest off the project seed and add its tile to the asset pool"
                onClick={() => assembleBeast()}
              >
                assemble a beast
              </button>
              <span style={{ ...noteText }} role="status" aria-live="polite" data-testid="beast-note">
                {beastNote && beastNote.status === 'banked' && `banked ${beastNote.id} — its tile is in the asset pool`}
                {beastNote && beastNote.status === 'pool-full' && 'the asset pool is full — remove an import first'}
                {beastNote && beastNote.status === 'nobody' && 'no new beast could be dealt on this seed'}
              </span>
            </div>
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
                      {b.kin && <path d={b.kin.path} fill="none" stroke="var(--dim)" strokeWidth="1" opacity="0.6" />}
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
                  </li>
                ))}
              </ul>
            )}
            {records.length > 0 && (
              <ul style={recList} data-testid="creature-records">
                {records.map((r) => (
                  <li key={r.id} style={recRow} data-testid="creature-record">
                    <span style={{ color: 'var(--ink)' }}>{r.id}</span>
                    <span>
                      <span style={caps}>{r.head ? 'h' : '–'}</span> · {r.limbs.length}
                      <span style={caps}>l</span> · {lookName(r.look)} · {voiceName(r.voice)}
                    </span>
                    <button
                      type="button"
                      className={`chip-btn ${genomeId === r.id ? 'act on' : 'act'}`}
                      aria-pressed={genomeId === r.id}
                      data-testid="record-genome"
                      title={`Show ${r.id}’s genome timeline`}
                      onClick={() => setGenomeId((cur) => (cur === r.id ? '' : r.id))}
                    >
                      genome
                    </button>
                    <button
                      type="button"
                      className="chip-btn act"
                      title={`Remove ${r.id}`}
                      aria-label={`Remove creature record ${r.id}`}
                      onClick={() => removeCreatureRecord(r.id)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {/* #1870 — the Genome Timeline: the selected record's genes as a strip (one node per gene, in record
                order) with inspect / mutate / replace. The selection is made in this lab's list, but the strip
                follows the RECORD in the bank — a hand edit that changes its body does not close its own surface. */}
            {(() => {
              const sel = (allRecords || []).find((r) => r.id === genomeId);
              if (!sel) return null;
              return (
                <GenomeTimeline
                  key={sel.id}
                  record={sel}
                  donors={(allRecords || []).filter((r) => r.id !== sel.id)}
                  legalBodies={assets.filter((a) => a.category !== 'creature').map((a) => a.id)}
                  hasBodyPoints={assets.some((a) => a.id === sel.body)}
                />
              );
            })()}
            {/* #1946 — the part preview: which assets Davis would deal onto this creature's bones on the current stage —
                the scene contract's own deal, read-only — with a kit filter to ask "what if this stage were these kits" */}
            {records.length > 0 &&
              (() => {
                const rec = records.find((r) => r.id === previewId) || records[0];
                const stageIds = Object.keys(enabledAssets || {}).filter(
                  (id) =>
                    enabledAssets[id] &&
                    id !== 'creature' &&
                    assets.some((a) => a.id === id && a.category !== 'creature'),
                );
                const pileOnly = previewKits.length
                  ? new Set(
                      previewKits.flatMap((id) => resolveKit(kitsById([id], kits)[0] || { where: {} }, descs).ids),
                    )
                  : null;
                const parts = previewDeal(rec, asset, stageIds, { seed, overlay: customAssets, pileOnly });
                return (
                  <div data-testid="part-preview" style={cardBox}>
                    <div style={{ ...secTitle, ...caps }}>parts davis would deal · {stageIds.length} on stage</div>
                    <div style={breedRow}>
                      {records.length > 1 && (
                        <select
                          aria-label="Preview creature"
                          value={rec.id}
                          onChange={(e) => setPreviewId(e.target.value)}
                        >
                          {records.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.id}
                            </option>
                          ))}
                        </select>
                      )}
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
            {/* #1852 — BREED: three sources → one child (Matt: "taking 3 artists style to get something new"). A source
                is a banked creature, or this shape wearing a Look and a Voice — never a stage. Discrete genes pick a
                parent, continuous ones blend, ~1 gene in 8 mutates, and the child names its parents. */}
            <div style={{ ...secTitle, ...caps, marginTop: 6 }} data-testid="breed-title">
              breed · {BREED_PARENTS} sources · mutation 1/{Math.round(1 / MUTATION_RATE)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>
              Pick three parents — banked creatures, or this shape in a Look and a Voice. Each gene comes whole from one
              parent; drives blend; about one gene in eight mutates.
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} data-testid="breed-slots">
              {liveSlots.map((slot, i) => {
                const setSlot = (patch) => setSlots((cur) => cur.map((s2, j) => (j === i ? { ...s2, ...patch } : s2)));
                const value =
                  slot.kind === 'assembly'
                    ? '@shape'
                    : slot.kind === 'kit'
                      ? `@kit:${slot.kitId}`
                      : slot.kind === 'creature'
                        ? slot.id
                        : '';
                return (
                  <div key={i} style={breedRow} data-testid="breed-slot">
                    <span style={{ ...caps, width: 14 }}>{i + 1}</span>
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
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="chip-btn act"
                data-testid="breed"
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
              <span style={{ ...noteText }} role="status" aria-live="polite" data-testid="breed-note">
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
            {(() => {
              const child = breedNote && (allRecords || []).find((r) => r.id === breedNote.id && r.lineage);
              if (!child) return null;
              return (
                <div style={{ fontSize: 10, color: 'var(--dim)', lineHeight: 1.6 }} data-testid="breed-lineage">
                  {child.id} ← {child.lineage.parents.join(' · ')} · {child.lineage.mutations.length} mutation
                  {child.lineage.mutations.length === 1 ? '' : 's'}
                  {child.lineage.mutations.map((m) => (
                    <div key={`${m.gene}-${m.kind}`}>
                      <span style={lower}>{m.gene}</span> {m.kind === 'swap' ? `from ${m.to}` : `→ ${m.value}`}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
        <footer style={foot}>
          <span style={{ fontSize: 10, color: 'var(--dim)' }}>
            every asset has attach points from its shape. your edits replace them for this asset and are saved with the
            project.
          </span>
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
  width: 620,
  maxWidth: '92vw',
  maxHeight: '88vh',
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
  letterSpacing: '0.14em',
  fontWeight: 700,
  flex: '0 0 auto',
};
const body = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  padding: 12,
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
};
const foot = { display: 'flex', gap: 6, padding: '8px 10px', borderTop: '1px solid var(--line)', flex: '0 0 auto' };
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
};
const breedRow = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--dim)', flexWrap: 'wrap' };
const cardBox = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 6,
  border: '1px solid var(--line)',
  fontSize: 10,
  color: 'var(--dim)',
};
const barRow = { display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '0.06em' };
const barTrack = { flex: '1 1 auto', height: 6, background: 'rgba(255,255,255,0.08)', display: 'block' };
const barFill = { display: 'block', height: '100%', background: 'var(--kc-red)' };
const stripRow = { display: 'flex', flexWrap: 'wrap', gap: 6 };
const partCell = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 };
const caps = { textTransform: 'uppercase' };
const lower = { textTransform: 'lowercase' }; // DS §5: casing lives in style // DS §5: casing lives in style, JSX stays lowercase
const noteText = { fontSize: 10, color: 'var(--dim)', alignSelf: 'center', letterSpacing: '0.06em' };
