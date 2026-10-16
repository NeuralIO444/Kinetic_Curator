// shelfView.mjs — the Keeps shelf revision: the pure presentation model
// behind ShelfView.jsx (one shelf at two sizes — mini in the ASSETS
// drawer, expanded as a floating panel over the canvas).
//
// Everything here is derivation, no state and no store: the component
// owns the one copy of the shelf's UI state (aim, query, sort, size)
// and both render paths read it through these functions, so the mini
// and the expanded shelf cannot disagree. The UX pass's rules live here
// as data: identity carries no seed (the seed is a caption, truncated
// to its last four digits), location is a right-edge tag (never prose
// in the meta line), and a keep whose record is not in hand says why
// in its row instead of hiding the reason in a tooltip.
import { STAGE_BUDGET } from '../curator/shelf.mjs';

/** The expanded panel's inset from the canvas wrap, in px — the same
 * inset the CHIAROSCURO floating editor (#1587) anchors with. */
export const SHELF_OVERLAY_INSET = 16;

/**
 * The overlay's geometry from the canvas wrap's rect — the anchor
 * math of the shipped floating editor, widened to the ruling's
 * "almost full screen": the panel takes the whole wrap minus the
 * inset on every side. Null when the wrap is too small to host it
 * (the editor simply doesn't open, exactly as #1587's anchor refuses).
 */
export function shelfAnchor(rect, inset = SHELF_OVERLAY_INSET) {
  if (!rect || rect.width < 80 || rect.height < 80) return null;
  return {
    top: rect.top + inset,
    left: rect.left + inset,
    width: rect.width - inset * 2,
    height: rect.height - inset * 2,
  };
}

/** The seed as a caption segment: last four digits, tabular — the full
 * seed stays in the row's title and remains searchable. Null when the
 * row carries no seed at all. */
export function seedTail(seed) {
  if (seed == null || seed === '') return null;
  const digits = String(seed).replace(/\D/g, '');
  if (!digits) return null;
  return `…${digits.slice(-4)}`;
}

const SEED_IN_LABEL = / · seed (\S+)$/;

/**
 * A row's identity line (P0-1): what the look IS, nothing else. The
 * shipped row label appends ` · seed NNN` for hand keeps — that
 * segment is demoted to the caption; every other label (the mined
 * provenance label included) passes through word for word.
 */
export function rowIdentity(row) {
  return String(row?.label || '').replace(SEED_IN_LABEL, '');
}

/** The seed segment for the caption: the record's seed when in hand,
 * else the one the label carried. Text form: `seed …4946`. */
export function rowSeedSegment(row) {
  const fromRecord = seedTail(row?.keep?.seed);
  if (fromRecord) return `seed ${fromRecord}`;
  const m = SEED_IN_LABEL.exec(String(row?.label || ''));
  return m ? `seed ${seedTail(m[1])}` : null;
}

/**
 * The caption under the identity (P0-1): the seed segment first, then
 * the facts the row always carried — families, origin, kept state,
 * staged state — at caption weight. Location is NOT here anymore: it
 * renders as the right-edge tag (rowLocationTag), scannable as a
 * column instead of prose repeated on every row.
 */
export function rowMeta(row) {
  const parts = [];
  const seed = rowSeedSegment(row);
  if (seed) parts.push(seed);
  if (row?.families?.length) parts.push(row.families.join(' '));
  if (row?.origin) parts.push(row.origin);
  parts.push(row?.keptAt ? `kept ${new Date(row.keptAt).toLocaleDateString()}` : 'kept (legacy)');
  parts.push(row?.stagedCount ? `staged ×${row.stagedCount}` : 'never staged');
  return parts;
}

/**
 * The right-edge state tag: tier first (a staged keep says so),
 * then location. One word-family per row, in one column — `on stage`
 * is the same tag the surface always rendered for stage members.
 */
export function rowLocationTag(row) {
  if (row?.tier === 'stage') return 'on stage';
  if (row?.location === 'disk') return 'on disk';
  if (row?.location === 'disk-away') return 'disk away';
  if (row?.location === 'missing') return 'file gone';
  return null;
}

/**
 * Why a row's actions are dead, said in the row (never only in a
 * tooltip): the record is not in hand. Disk-read keeps (record in
 * hand, location 'disk') act normally and get no reason.
 */
export function rowReason(row) {
  if (row?.keep) return null;
  if (row?.location === 'missing') return 'file gone from the loot folder';
  if (row?.location === 'disk-away') return 'connect the loot folder to bring it back';
  return null;
}

/**
 * The stage as a fixed grid of cells (P0-2): STAGE_BUDGET cells,
 * always — staged keeps in stage order, then ghost cells (slot number
 * only) so the 16 and the remaining budget are visible at a glance.
 * A cell carries its two lines as data: the identity (`mode ·
 * palette`) and the marks (mined ×2, on deck) the pass demotes to the
 * cell's second line.
 */
export function stageCells(staged, performingKeepId) {
  const cells = [];
  for (let i = 0; i < STAGE_BUDGET; i++) {
    const k = (staged || [])[i] || null;
    if (!k) {
      cells.push({ n: i + 1, keepId: null, label: '', marks: [], onDeck: false });
      continue;
    }
    const marks = [];
    if (k.provenance?.source === 'explorer') marks.push('mined ×2');
    const onDeck = k.id === performingKeepId;
    if (onDeck) marks.push('on deck');
    cells.push({
      n: i + 1,
      keepId: k.id,
      label: `${k.config?.layout?.mode || 'look'} · ${k.config?.palette?.id || ''}`,
      marks,
      onDeck,
    });
  }
  return cells;
}

/**
 * The fill band's one line (P1-1): while a slot is aimed, the aim
 * sentence REPLACES the table-in-force line — same band, no sixth
 * band stacked at the moment of the gesture. The sentence is the
 * shipped one, word for word; the table line returns when the aim
 * clears.
 */
export function fillBandState({ aimedSlot, tableLine }) {
  if (aimedSlot != null) {
    return { kind: 'aim', text: `slot ${aimedSlot + 1} aimed — pick a shelf keep to swap in` };
  }
  return { kind: 'table', text: tableLine };
}

/**
 * The tools stand down (pass §4): with an empty collection, search,
 * sorts and the KINETIC band are controls for nothing — silence is
 * default. They return as one block with the first keep.
 */
export function toolsStandDown(collectionCount) {
  return !(collectionCount > 0);
}
