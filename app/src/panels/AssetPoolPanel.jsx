// AssetPoolPanel (P02) — pool + overlay media manager (#113) + studio (#114)
import { useMemo, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import { useStore } from '../state/store.js';
import { attachPointsFor } from '../engine/autoAttach.js';
import { PanelHeader } from '../components/PanelHeader.jsx';
import { ShelfView } from './ShelfView.jsx'; // #1589: the keeps shelf lives in this drawer
import { ALL_CATEGORIES } from '../data/categories.js';
import { emit, Events } from '../composition/eventBus.js';
import { AssetInspector, BulkBar } from './AssetInspector.jsx';
import { FACETS, FACET_TERMS } from '../data/assetFacets.js';
import { ROLES } from '../assets/assetRoles.js';
import {
  poolDescriptors,
  filterRecords,
  facetCounts,
  categoryCounts,
  activeChips,
  toggleFacet,
  nextSelection,
} from './assetPoolLogic.mjs';

const ROLE_STEPS = [0.6, 0.8]; // a role chip cycles: off → ≥ .6 → ≥ .8 → off
const WEIGHT_CHOICES = [
  ['light', 'L'],
  ['medium', 'M'],
  ['heavy', 'H'],
];

const WEIGHT_LABEL = { heavy: 'H', medium: 'M', light: 'L' };
const WEIGHT_TITLE = { heavy: 'heavy (×4)', medium: 'medium (×2)', light: 'light (×1)' };

function ingestMarkup(svg, hint) {
  if (!svg || !String(svg).includes('<')) return;
  emit(Events.ASSETS_INGEST, { svg: String(svg), hint: hint || 'ingest' });
}

// #1355 — the asset's attach points, drawn on its preview as small structure-red squares: filled when the artist
// placed them, hollow when they come from the shape. Built from sanitized numbers only.
const attachMarks = (points, own) =>
  (points || [])
    .map(
      (p) =>
        `<rect data-attach="${own ? 'own' : 'auto'}" x="${p.x - 5}" y="${p.y - 5}" width="10" height="10" fill="${own ? 'var(--kc-red)' : '#000'}" stroke="${own ? '#000' : 'var(--kc-red)'}" stroke-width="2"/>`,
    )
    .join('');

export function AssetPoolPanel() {
  const fileRef = useRef(null);
  const swapRef = useRef(null);
  const swapId = useRef(null);
  const [Studio, setStudio] = useState(null);
  const [studioSeed, setStudioSeed] = useState(null);
  // #601: a failed chunk load must say so (was silent). The browser caches a failed
  // dynamic import per URL, so a retry on the same page replays the failure with no
  // network request — only a reload recovers, and the message says so. Cleared at the
  // start of each open so a fresh failure replaces, rather than stacks on, the old one.
  const [studioError, setStudioError] = useState(null);
  const { assets } = useApp();
  const { state } = useApp((s) => ({
    enabled: s.enabledAssets,
    search: s.search,
    catFilter: s.catFilter,
    poolView: s.poolView,
    weightOverrides: s.assetWeightOverrides || {},
    still: s.assetStill || {},
    assetOptions: s.assetOptions || {},
    ingestError: s.ingestError,
    assetTags: s.assetTags || {},
  }));
  const { enabled, search, catFilter, poolView, weightOverrides, still, assetOptions, ingestError, assetTags } = state;
  // #1943 — facet / role filters, the selection and the facet drawer are panel-local: they are a view of the pool, not project state
  const [facets, setFacets] = useState({});
  const [role, setRole] = useState({});
  const [facetsOpen, setFacetsOpen] = useState(false);
  const [selection, setSelection] = useState([]);
  const anchor = useRef(null);

  const openStudio = async (seed) => {
    setStudioError(null);
    try {
      const mod = await import('./AssetStudioModal.jsx');
      setStudio(() => mod.AssetStudioModal);
      setStudioSeed(seed || null);
    } catch (e) {
      setStudioError(e && e.message ? e.message : String(e));
    }
  };

  const closeStudio = (saved) => {
    setStudio(null);
    setStudioSeed(null);
    if (saved) emit(Events.ASSETS_CAT_FILTER, 'user');
  };

  // #725 region mattes — dynamic import like the studio (keeps the picker
  // out of the initial bundle). The picker looks the asset up live by id.
  const [pickerId, setPickerId] = useState(null);
  const [Picker, setPicker] = useState(null);
  // #1355 — the wet lab window (attach points). Dynamic import, like the picker.
  const [labId, setLabId] = useState(null);
  const [Lab, setLab] = useState(null);
  const attach = useStore((s) => s.assetAttach);
  const openLab = async (id) => {
    const mod = await import('./WetLab.jsx');
    setLab(() => mod.WetLab);
    setLabId(id);
  };
  const openPicker = async (id) => {
    const mod = await import('./RegionPicker.jsx');
    setPicker(() => mod.RegionPicker);
    setPickerId(id);
  };

  // #1943 — every asset's descriptor (traits, role fits, effective tags), recomputed when the pool or the edits change
  const recs = useMemo(() => poolDescriptors(assets, assetTags), [assets, assetTags]);
  const filters = useMemo(() => ({ cat: catFilter, text: search, facets, role }), [catFilter, search, facets, role]);
  const visible = useMemo(() => filterRecords(recs, filters), [recs, filters]);
  const filtered = useMemo(() => {
    const byId = new Map(assets.map((x) => [x.id, x]));
    return visible.map((r) => byId.get(r.id)).filter(Boolean);
  }, [assets, visible]);
  const recById = useMemo(() => new Map(recs.map((r) => [r.id, r])), [recs]);
  const catCounts = useMemo(() => categoryCounts(recs), [recs]);
  // facet counts are taken over what the OTHER filters leave, so a chip's number is what tapping it would show
  const fCounts = useMemo(() => facetCounts(filterRecords(recs, { ...filters, facets: {} })), [recs, filters]);
  const chips = activeChips(filters);
  const narrowed = !!(String(search).trim() || chips.some((c) => c.kind === 'facet' || c.kind === 'role'));
  const order = filtered.map((x) => x.id);
  const sel = selection.filter((id) => recById.has(id));
  const clearFilter = (c) => {
    if (c.kind === 'cat') emit(Events.ASSETS_CAT_FILTER, 'all');
    else if (c.kind === 'text') emit(Events.ASSETS_SEARCH, '');
    else if (c.kind === 'facet') setFacets((f) => toggleFacet(f, c.facet, c.term));
    else if (c.kind === 'role')
      setRole((r) => {
        const n = { ...r };
        delete n[c.role];
        return n;
      });
  };
  const selectTile = (id, e) => {
    setSelection((cur) => nextSelection(cur, order, id, { range: !!e?.shiftKey, anchor: anchor.current }));
    anchor.current = id;
  };
  const allOnOff = (on) =>
    narrowed ? emit(Events.ASSETS_BULK, { ids: order, enabled: on }) : emit(Events.ASSETS_TOGGLE_ALL, on);
  const actions = {
    openLab: (id) => openLab(id),
    openStudio: (seed) => openStudio(seed),
    openPicker: (id) => openPicker(id),
    swap: (id) => {
      swapId.current = id;
      swapRef.current?.click();
    },
  };

  const overlayCount = assets.filter((a) => String(a.id).startsWith('user:')).length;
  const enabledCount = Object.values(enabled).filter(Boolean).length;
  const effectiveWeight = (a) => weightOverrides[a.id] || a.weight || 'medium';

  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    const text = e.dataTransfer?.getData('text/plain') || e.dataTransfer?.getData('image/svg+xml');
    if (file && /svg/i.test(file.type || file.name)) {
      file.text().then((svg) => ingestMarkup(svg, file.name));
      return;
    }
    if (text) ingestMarkup(text, 'paste');
  };

  return (
    <div
      className="panel panel-pool"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onPaste={(e) => {
        const text = e.clipboardData?.getData('text/plain') || e.clipboardData?.getData('image/svg+xml');
        if (text && /<svg/i.test(text)) {
          e.preventDefault();
          ingestMarkup(text, 'paste');
        }
      }}
      tabIndex={0}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) file.text().then((svg) => ingestMarkup(svg, file.name));
          e.target.value = '';
        }}
      />
      <input
        ref={swapRef}
        type="file"
        accept=".svg,image/svg+xml"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          const id = swapId.current;
          if (file && id) file.text().then((svg) => emit(Events.ASSETS_REPLACE, { id, svg }));
          e.target.value = '';
          swapId.current = null;
        }}
      />
      <PanelHeader
        tag="P02"
        title="ASSET POOL"
        subtitle={`${enabledCount}/${assets.length} active${overlayCount ? ` · ${overlayCount} user` : ''}`}
      >
        <div className="header-tools">
          <button className="chip-btn act" title="Motif kit — overlay only" onClick={() => openStudio(null)}>
            new
          </button>
          <button
            className="chip-btn act"
            title="Import SVG into project overlay"
            onClick={() => fileRef.current?.click()}
          >
            import
          </button>
          {/* #310: GRID/LIST is a remembered preference now (persisted across
              sessions) — no live toggle. poolView still drives the layout. */}
        </div>
      </PanelHeader>
      {ingestError && (
        <div style={{ color: 'var(--accent)', fontSize: 11, padding: '4px 10px' }}>INGEST: {ingestError}</div>
      )}
      {studioError && (
        <div style={{ color: 'var(--kc-warn)', fontSize: 11, padding: '4px 10px' }}>
          STUDIO failed to load — reload the page to retry. ({studioError})
        </div>
      )}
      <div className="pool-top">
        <div className="pool-controls">
          <div className="cat-filter">
            <button
              className={`cat-chip ${catFilter === 'all' ? 'active' : ''}`}
              onClick={() => emit(Events.ASSETS_CAT_FILTER, 'all')}
            >
              ALL <span className="cat-chip-count">{assets.length}</span>
            </button>
            <button
              className={`cat-chip ${catFilter === 'user' ? 'active' : ''}`}
              onClick={() => emit(Events.ASSETS_CAT_FILTER, 'user')}
            >
              USER <span className="cat-chip-count">{overlayCount}</span>
            </button>
            {ALL_CATEGORIES.map((c) => (
              <button
                key={c}
                className={`cat-chip ${catFilter === c ? 'active' : ''}`}
                onClick={() => emit(Events.ASSETS_CAT_FILTER, c)}
              >
                {c} <span className="cat-chip-count">{catCounts[c] || 0}</span>
              </button>
            ))}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
              <button className="chip-btn act" onClick={() => allOnOff(true)}>
                {narrowed ? 'shown on' : 'all on'}
              </button>
              <button className="chip-btn act" onClick={() => allOnOff(false)}>
                {narrowed ? 'shown off' : 'all off'}
              </button>
            </span>
          </div>
          {catFilter !== 'all' && catFilter !== 'user' && (
            <div className="cat-weight" role="group" aria-label={`weight of every ${catFilter} asset`}>
              <span className="insp-facet-name">{catFilter} weight</span>
              {WEIGHT_CHOICES.map(([w, label]) => (
                <button
                  key={w}
                  type="button"
                  className="chip-btn act"
                  title={`Set every ${catFilter} asset to ${w}, imports included`}
                  onClick={() => emit(Events.ASSETS_CATEGORY_WEIGHT, { category: catFilter, weight: w })}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="pool-search">
            <span className="prompt">⟩</span>
            <input
              placeholder="filter · drop SVG · paste code from Illustrator or any vector app"
              value={search}
              onChange={(e) => emit(Events.ASSETS_SEARCH, e.target.value)}
            />
          </div>
          <div className="pool-facets">
            <button
              type="button"
              className="chip-btn act"
              aria-expanded={facetsOpen}
              title="Filter by tag facet and role fit"
              onClick={() => setFacetsOpen((o) => !o)}
            >
              tags &amp; roles {facetsOpen ? '▴' : '▾'}
            </button>
            {chips.map((c) => (
              <span key={c.key} className="insp-chip confirmed filter-chip">
                {c.label}
                <button type="button" aria-label={`Remove filter ${c.label}`} onClick={() => clearFilter(c)}>
                  ✕
                </button>
              </span>
            ))}
            <span className="pool-shown" aria-live="polite">
              {filtered.length}/{assets.length}
            </span>
          </div>
          {facetsOpen && (
            <div className="facet-drawer" aria-label="tag and role filters">
              {FACETS.map((f) => (
                <div key={f} className="insp-facet" data-facet={f}>
                  <span className="insp-facet-name">{f}</span>
                  <span className="insp-chips">
                    {FACET_TERMS[f]
                      .filter((t) => fCounts[f][t] || (facets[f] || []).includes(t))
                      .map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`cat-chip ${(facets[f] || []).includes(t) ? 'active' : ''}`}
                          aria-pressed={(facets[f] || []).includes(t)}
                          onClick={() => setFacets((cur) => toggleFacet(cur, f, t))}
                        >
                          {t} <span className="cat-chip-count">{fCounts[f][t] || 0}</span>
                        </button>
                      ))}
                  </span>
                </div>
              ))}
              <div className="insp-facet" data-facet="role">
                <span className="insp-facet-name">role fit</span>
                <span className="insp-chips">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`cat-chip ${role[r] != null ? 'active' : ''}`}
                      aria-pressed={role[r] != null}
                      title={`${r}: tap to cycle off, ≥ .6, ≥ .8`}
                      onClick={() =>
                        setRole((cur) => {
                          const n = { ...cur };
                          const i = cur[r] == null ? -1 : ROLE_STEPS.indexOf(cur[r]);
                          if (i + 1 >= ROLE_STEPS.length) delete n[r];
                          else n[r] = ROLE_STEPS[i + 1];
                          return n;
                        })
                      }
                    >
                      {r}
                      {role[r] != null ? ` ≥ ${role[r]}` : ''}
                    </button>
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>
        {sel.length === 1 && recById.get(sel[0]) && (
          <AssetInspector
            key={sel[0]}
            rec={recById.get(sel[0])}
            asset={assets.find((x) => x.id === sel[0])}
            on={!!enabled[sel[0]]}
            still={!!still[sel[0]]}
            weight={effectiveWeight(assets.find((x) => x.id === sel[0]))}
            attachEdited={Array.isArray(attach?.[sel[0]])}
            isUser={String(sel[0]).startsWith('user:')}
            actions={actions}
            onClose={() => setSelection([])}
          />
        )}
        {sel.length > 1 && (
          <BulkBar ids={sel} recs={sel.map((id) => recById.get(id))} onClose={() => setSelection([])} />
        )}
      </div>
      <div className={`pool-body ${poolView}`}>
        {filtered.length === 0 && <div className="pool-empty">nothing matches — remove a filter above</div>}
        <div className="asset-grid">
          {filtered.map((a) => {
            const w = effectiveWeight(a);
            const isUser = String(a.id).startsWith('user:');
            const picked = sel.includes(a.id);
            return (
              <div
                key={a.id}
                className={`tile ${enabled[a.id] ? 'tile-on' : ''}${enabled[a.id] && still[a.id] ? ' pinned' : ''}${picked ? ' picked' : ''}`}
                style={isUser ? { outline: '1px dashed var(--accent)' } : undefined}
              >
                <button
                  className="tile-toggle"
                  title="Tap: switch on/off · shift- or ctrl-click: select · alt-click: solo"
                  onClick={(e) => {
                    if (e.shiftKey || e.ctrlKey || e.metaKey) selectTile(a.id, e);
                    else if (e.altKey) emit(Events.ASSETS_SOLO, { id: a.id });
                    else emit(Events.ASSETS_TOGGLE, { id: a.id });
                  }}
                >
                  <svg
                    className="tile-svg"
                    viewBox="0 0 100 100"
                    width="40"
                    height="40"
                    dangerouslySetInnerHTML={{
                      __html:
                        a.svg +
                        (enabled[a.id] ? attachMarks(attachPointsFor(a, attach), Array.isArray(attach?.[a.id])) : ''),
                    }}
                  />
                </button>
                <button
                  className="tile-weight"
                  title={WEIGHT_TITLE[w]}
                  aria-label={`weight ${w}: ${WEIGHT_TITLE[w]}. Tap to change`}
                  onClick={(e) => {
                    e.stopPropagation();
                    emit(Events.ASSETS_WEIGHT_CYCLE, { id: a.id });
                  }}
                >
                  {WEIGHT_LABEL[w]}
                </button>
                <button
                  type="button"
                  className="tile-solo"
                  aria-label={`Solo ${a.id}`}
                  title="Solo: only this asset in the pool"
                  onClick={(e) => {
                    e.stopPropagation();
                    emit(Events.ASSETS_SOLO, { id: a.id });
                  }}
                >
                  solo
                </button>
                <button
                  type="button"
                  className={`tile-pick${picked ? ' on' : ''}`}
                  aria-pressed={picked}
                  aria-label={`Select ${a.id}`}
                  title="Select (then edit tags and weight in the inspector)"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectTile(a.id, e);
                  }}
                >
                  <i aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="tile-meta"
                  title={`${a.id} · ${isUser ? 'user' : a.category} — open the inspector`}
                  aria-label={`Inspect ${a.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    anchor.current = a.id;
                    setSelection([a.id]);
                  }}
                >
                  <span className="tile-id">{a.id}</span>
                </button>
                {/* #1128 — pin this asset still: a discrete on/off, so TE (rule 2). Only assets in use have one. */}
                {enabled[a.id] && (
                  <div className="tile-foot">
                    <button
                      type="button"
                      className={`tile-still${still[a.id] ? ' on' : ''}`}
                      aria-pressed={!!still[a.id]}
                      aria-label={`${a.id}: ${still[a.id] ? 'pinned still' : 'moves'}`}
                      title={
                        still[a.id]
                          ? 'Pinned still: this asset stays where it is placed. Tap to let it move again.'
                          : 'Moves with the living-motion floor. Tap to pin it still.'
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        emit(Events.ASSETS_STILL_TOGGLE, { id: a.id });
                      }}
                    >
                      <i aria-hidden="true" />
                      still
                    </button>
                    {/* #1694 S2 — record-declared tile options (the citizen's family): a cycle chip
                        per declared option, rendered for ANY asset that declares options — no
                        per-asset branch. The value shown is the artist's set value or the
                        declared default. */}
                    {(Array.isArray(a.options) ? a.options : []).map((opt) => {
                      const cur = assetOptions[a.id]?.[opt.key] ?? opt.default ?? opt.choices?.[0];
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          className="tile-opt"
                          aria-label={`${a.id} ${opt.key}: ${cur}. Tap to cycle`}
                          title={`${opt.key}: ${cur} — tap to cycle (${(opt.choices || []).join(' · ')})`}
                          onClick={(e) => {
                            e.stopPropagation();
                            emit(Events.ASSETS_OPTION_CYCLE, { id: a.id, key: opt.key });
                          }}
                        >
                          {opt.key} {cur}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="tile-dup"
                      aria-label={`Duplicate ${a.id}`}
                      title="Duplicate overlay copy"
                      onClick={(e) => {
                        e.stopPropagation();
                        emit(Events.ASSETS_DUPLICATE, { id: a.id });
                      }}
                    >
                      dup
                    </button>
                    <button
                      type="button"
                      className={`tile-edit${Array.isArray(attach?.[a.id]) ? ' on' : ''}`}
                      aria-label={`Open ${a.id} in the wet lab${Array.isArray(attach?.[a.id]) ? ': attach points edited by hand' : ''}`}
                      title="Wet lab: mark where other parts may attach to this asset"
                      data-testid="tile-edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        openLab(a.id);
                      }}
                    >
                      wet lab
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* #1589 — the keeps shelf: stage + collection, explorable (spec §2.2) */}
      <ShelfView />
      {Studio && <Studio seedSvg={studioSeed?.svg || ''} seedId={studioSeed?.id || ''} onClose={closeStudio} />}
      {Picker && pickerId && (
        <Picker
          assetId={pickerId}
          onClose={() => {
            setPicker(null);
            setPickerId(null);
          }}
        />
      )}
      {Lab && labId && (
        <Lab
          assetId={labId}
          onClose={() => {
            setLab(null);
            setLabId(null);
          }}
        />
      )}
    </div>
  );
}
