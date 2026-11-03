// AssetInspector (#1943) — the asset pool's drawer: what an asset IS (family, style, measured traits, role fits),
// its tags by facet (confirmed solid, suggested outlined: tap to confirm, ✕ to reject), the free-tag input with
// vocabulary autocomplete, the weight, and every action a tile used to hide (still / dup / shape / wet lab /
// regions / rename / swap / delete). A selection of two or more shows the bulk bar instead.
// Presentational: it renders what the panel hands it and emits the same bus events the tiles do.
import { useState } from 'react';
import { emit, Events } from '../composition/eventBus.js';
import { FACETS, FACET_TERMS, FACET_OF, FREE_LEN } from '../data/assetFacets.js';
import { canonTag, TAG_VOCAB } from '../data/assetStyle.js';
import { TRAIT_NAMES } from '../assets/assetTraits.js';
import { ROLES } from '../assets/assetRoles.js';

const WEIGHTS = [
  ['light', 'L', 'light (×1)'],
  ['medium', 'M', 'medium (×2)'],
  ['heavy', 'H', 'heavy (×4)'],
];
const REASON = {
  tag: 'from the asset’s own tags',
  category: 'from its category',
  family: 'from its source pack',
  trait: 'from its measured shape',
};
const fmt = (n) => (n == null ? '–' : n.toFixed(2).replace(/^0/, ''));

/** One facet row: confirmed chips (solid), suggested chips (outlined), and a + picker for the rest. */
function FacetRow({ facet, rec, ids }) {
  const d = rec.descriptor;
  const added = (d.tags.confirmed && d.tags.confirmed.add && d.tags.confirmed.add[facet]) || [];
  const dropped = (d.tags.confirmed && d.tags.confirmed.drop && d.tags.confirmed.drop[facet]) || [];
  const sug = d.tags.suggested.filter((s) => s.facet === facet && !dropped.includes(s.tag));
  const sugOnly = sug.filter((s) => !added.includes(s.tag));
  const present = new Set([...added, ...sug.map((s) => s.tag)]);
  const rest = FACET_TERMS[facet].filter((t) => !present.has(t));
  const edit = (e) => emit(Events.ASSETS_TAGS, { ids, edit: e });
  return (
    <div className="insp-facet" data-facet={facet}>
      <span className="insp-facet-name">{facet}</span>
      <span className="insp-chips">
        {added.map((t) => (
          <span key={`a:${t}`} className="insp-chip confirmed">
            {t}
            <button
              type="button"
              aria-label={`Remove ${facet} tag ${t}`}
              title="Remove this tag"
              onClick={() => edit({ op: 'remove', facet, tag: t })}
            >
              ✕
            </button>
          </span>
        ))}
        {sugOnly.map((s) => (
          <span key={`s:${s.tag}`} className="insp-chip suggested" title={`suggested ${REASON[s.reason]}`}>
            <button
              type="button"
              className="insp-chip-main"
              aria-label={`Confirm ${facet} tag ${s.tag} (suggested ${REASON[s.reason]})`}
              onClick={() => edit({ op: 'confirm', facet, tag: s.tag })}
            >
              {s.tag}
            </button>
            <button
              type="button"
              aria-label={`Reject suggested ${facet} tag ${s.tag}`}
              title="Reject this suggestion"
              onClick={() => edit({ op: 'reject', facet, tag: s.tag })}
            >
              ✕
            </button>
          </span>
        ))}
        {rest.length > 0 && (
          <select
            className="insp-add"
            aria-label={`Add a ${facet} tag`}
            value=""
            onChange={(e) => e.target.value && edit({ op: 'confirm', facet, tag: e.target.value })}
          >
            <option value="">+ add</option>
            {rest.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </span>
    </div>
  );
}

/** The free-tag input. A word the vocabulary knows lands in its facet; anything else is a free tag. */
function FreeInput({ ids, free }) {
  const [text, setText] = useState('');
  const submit = () => {
    const w = text.trim();
    if (!w) return;
    const c = canonTag(w);
    if (c && FACET_OF[c]) emit(Events.ASSETS_TAGS, { ids, edit: { op: 'confirm', facet: FACET_OF[c], tag: c } });
    else emit(Events.ASSETS_TAGS, { ids, edit: { op: 'free', tag: w } });
    setText('');
  };
  return (
    <div className="insp-facet" data-facet="free">
      <span className="insp-facet-name">free</span>
      <span className="insp-chips">
        {free.map((t) => (
          <span key={t} className="insp-chip confirmed">
            {t}
            <button
              type="button"
              aria-label={`Remove free tag ${t}`}
              title="Remove this tag"
              onClick={() => emit(Events.ASSETS_TAGS, { ids, edit: { op: 'unfree', tag: t } })}
            >
              ✕
            </button>
          </span>
        ))}
        <input
          className="insp-free"
          list="insp-vocab"
          maxLength={FREE_LEN}
          placeholder="add a tag…"
          aria-label="Add a free tag"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <datalist id="insp-vocab">
          {TAG_VOCAB.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </span>
    </div>
  );
}

function WeightButtons({ ids, current }) {
  return (
    <span className="insp-weight" role="group" aria-label="weight">
      {WEIGHTS.map(([w, label, title]) => (
        <button
          key={w}
          type="button"
          className={current === w ? 'on' : ''}
          aria-pressed={current === w}
          title={title}
          onClick={() => emit(Events.ASSETS_BULK, { ids, weight: w })}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

/** Rename / delete without window.prompt / window.confirm: an inline row that asks, then does. */
function InlineAsk({ kind, asset, onDone }) {
  const [name, setName] = useState(String(asset.id).replace(/^user:/, ''));
  if (kind === 'rename')
    return (
      <div className="insp-ask" role="group" aria-label={`Rename ${asset.id}`}>
        <input
          aria-label="New overlay id (no user: prefix)"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onDone()}
        />
        <button
          type="button"
          onClick={() => {
            if (name.trim()) emit(Events.ASSETS_RENAME, { id: asset.id, name: name.trim() });
            onDone();
          }}
        >
          rename
        </button>
        <button type="button" onClick={onDone}>
          cancel
        </button>
      </div>
    );
  return (
    <div className="insp-ask" role="alertdialog" aria-label={`Remove ${asset.id}?`}>
      <span>remove {asset.id}?</span>
      <button
        type="button"
        className="del"
        onClick={() => {
          emit(Events.ASSETS_REMOVE, { id: asset.id });
          onDone(true);
        }}
      >
        remove
      </button>
      <button type="button" onClick={() => onDone()}>
        keep
      </button>
    </div>
  );
}

export function AssetInspector({ rec, asset, on, still, weight, attachEdited, isUser, actions, onClose }) {
  const [ask, setAsk] = useState(null);
  const d = rec.descriptor;
  const free = d.tags.effective.free;
  const id = rec.id;
  return (
    <aside className="asset-inspector" aria-label={`Inspector: ${id}`} data-testid="asset-inspector">
      <header className="insp-head">
        <svg
          className="insp-preview"
          viewBox="0 0 100 100"
          width="96"
          height="96"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: asset.svg }}
        />
        <div className="insp-title">
          <b title={id}>{id}</b>
          <span className="insp-sub">
            {rec.family} · {rec.category} · {rec.style}
          </span>
          <WeightButtons ids={[id]} current={weight} />
        </div>
        <button type="button" className="insp-close" aria-label="Close inspector" title="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      <section className="insp-traits" aria-label="measured traits">
        {d.traits ? (
          TRAIT_NAMES.map((k) => (
            <span key={k} className="insp-trait" title={`${k}: measured from the drawing`}>
              <i>{k}</i>
              <b>{fmt(d.traits[k])}</b>
            </span>
          ))
        ) : (
          <span className="insp-sub">measuring…</span>
        )}
      </section>
      <section className="insp-roles" aria-label="role fits">
        {ROLES.map((r) => (
          <span key={r} className="insp-role" title={`${r} fit ${fmt(d.roles[r])}`}>
            <i>{r}</i>
            <span className="insp-bar">
              <span style={{ width: `${Math.round(d.roles[r] * 100)}%` }} />
            </span>
            <b>{fmt(d.roles[r])}</b>
          </span>
        ))}
      </section>
      <section className="insp-tags" aria-label="tags">
        {FACETS.map((f) => (
          <FacetRow key={f} facet={f} rec={rec} ids={[id]} />
        ))}
        <FreeInput ids={[id]} free={free} />
      </section>
      <section className="insp-actions" aria-label="actions">
        <button
          type="button"
          className={on ? 'on' : ''}
          aria-pressed={on}
          title={on ? 'In the pool. Tap to switch it off.' : 'Out of the pool. Tap to switch it on.'}
          onClick={() => emit(Events.ASSETS_TOGGLE, { id })}
        >
          {on ? 'on' : 'off'}
        </button>
        <button
          type="button"
          title="Solo: only this asset in the pool (alt-click a tile does the same)"
          onClick={() => emit(Events.ASSETS_SOLO, { id })}
        >
          solo
        </button>
        <button
          type="button"
          className={still ? 'on' : ''}
          aria-pressed={still}
          title={
            still
              ? 'Pinned still. Tap to let it move again.'
              : 'Moves with the living-motion floor. Tap to pin it still.'
          }
          onClick={() => emit(Events.ASSETS_STILL_TOGGLE, { id })}
        >
          still
        </button>
        <button
          type="button"
          title="Duplicate as an overlay copy"
          onClick={() => emit(Events.ASSETS_DUPLICATE, { id })}
        >
          dup
        </button>
        <button
          type="button"
          className={attachEdited ? 'on' : ''}
          title="Wet lab: mark where other parts may attach to this asset"
          onClick={() => actions.openLab(id)}
        >
          wet lab
        </button>
        {isUser && (
          <>
            <button
              type="button"
              title="Shape: redraw it in the Studio"
              onClick={() => actions.openStudio({ id, svg: asset.svg })}
            >
              shape
            </button>
            <button
              type="button"
              title="Region mattes: pick regions for slots A/B/C/D"
              onClick={() => actions.openPicker(id)}
            >
              regions
            </button>
            <button type="button" onClick={() => setAsk('rename')}>
              rename
            </button>
            <button type="button" title="Replace the drawing, keeping its tags" onClick={() => actions.swap(id)}>
              swap
            </button>
            <button type="button" className="del" onClick={() => setAsk('delete')}>
              delete
            </button>
          </>
        )}
      </section>
      {ask && (
        <InlineAsk
          kind={ask}
          asset={asset}
          onDone={(removed) => {
            setAsk(null);
            if (removed) onClose();
          }}
        />
      )}
    </aside>
  );
}

/** Two or more tiles selected: one bar edits them all (bulk tag add / remove, weight, on / off). */
export function BulkBar({ ids, recs, onClose }) {
  const [facet, setFacet] = useState(FACETS[0]);
  const [tag, setTag] = useState('');
  const edit = (e) => emit(Events.ASSETS_TAGS, { ids, edit: e });
  // a tag every selected asset already carries can be taken off them all
  const common = FACETS.flatMap((f) =>
    FACET_TERMS[f]
      .filter((t) => recs.length && recs.every((r) => r.descriptor.tags.effective[f].includes(t)))
      .map((t) => [f, t]),
  );
  return (
    <aside className="asset-inspector bulk" aria-label={`Bulk edit: ${ids.length} assets`} data-testid="asset-bulk">
      <header className="insp-head">
        <div className="insp-title">
          <b>{ids.length} selected</b>
          <WeightButtons ids={ids} current={null} />
        </div>
        <button
          type="button"
          className="insp-close"
          aria-label="Clear selection"
          title="Clear selection"
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <section className="insp-actions" aria-label="bulk actions">
        <button type="button" onClick={() => emit(Events.ASSETS_BULK, { ids, enabled: true })}>
          all on
        </button>
        <button type="button" onClick={() => emit(Events.ASSETS_BULK, { ids, enabled: false })}>
          all off
        </button>
        <button
          type="button"
          title="Forget the tag edits on every selected asset"
          onClick={() => edit({ op: 'clear' })}
        >
          reset tags
        </button>
      </section>
      <section className="insp-tags" aria-label="bulk tags">
        <div className="insp-facet">
          <span className="insp-facet-name">add tag</span>
          <span className="insp-chips">
            <select
              aria-label="Facet"
              value={facet}
              onChange={(e) => {
                setFacet(e.target.value);
                setTag('');
              }}
            >
              {FACETS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">choose…</option>
              {FACET_TERMS[facet].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!tag}
              onClick={() => {
                edit({ op: 'confirm', facet, tag });
                setTag('');
              }}
            >
              tag all
            </button>
          </span>
        </div>
        <FreeInput ids={ids} free={[]} />
        {common.length > 0 && (
          <div className="insp-facet">
            <span className="insp-facet-name">shared</span>
            <span className="insp-chips">
              {common.map(([f, t]) => (
                <span key={`${f}:${t}`} className="insp-chip confirmed">
                  {t}
                  <button
                    type="button"
                    aria-label={`Remove ${f} tag ${t} from all selected`}
                    title="Remove from every selected asset"
                    onClick={() => edit({ op: 'remove', facet: f, tag: t })}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </span>
          </div>
        )}
      </section>
    </aside>
  );
}
