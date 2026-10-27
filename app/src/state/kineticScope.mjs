// kineticScope.mjs — #1772 follow-up: the START pill is a four-state scope cycle (Matt's ruling, 2026-10-27).
//
//   OFF → WEAK → MED → KOZ → OFF …   (one pill, tap to advance, the same gesture as the shape-mix chips)
//
// The state sets BOTH what a cold launch opens on AND the ceiling over every KINETIC tap:
//   OFF   the smallest decks — the 19 curated 4-shape sets (49 assets), the 33 original looks, the 4 + 15 voices.
//         Launch: the deterministic factory opener (what FIXED was).
//   WEAK  one notch wider — pools dealt from the whole library (S1), the same 33 looks and 19 voices.
//         Launch: one look + voice pass under this deck.
//   MED   the expanded decks — the whole library, the 64 looks (S4) and the 64 voices (S5).
//         Launch: one look + voice pass under this deck.
//   KOZ   everything at full width, plus the chaos roll (kineticRoll) when the button is hammered.
//         Launch: one full wild roll (what K.O.Z. was).
// The curator's cap is identical at every state. The armed roll scope (#964) still pins mode / motion inside it.
//
// Pure data: no store, no clock. Legacy values ('fixed', 'chaos' — #946) sanitize to OFF and KOZ.
import { COMPOSITION_PRESETS } from '../data/presets.js';
import { STYLE_LOOKS } from '../data/styleLooks.js';
import { VOICE_DECK } from '../data/voiceDeck.js';
import { SHAPE_SETS } from '../data/voices.js';
import { ASSETS } from '../data/assets/index.js';
import { dealableRecords } from './rollPool.mjs';

export const SCOPE_CYCLE = Object.freeze(['off', 'weak', 'med', 'koz']);
export const SCOPE_LABEL = Object.freeze({ off: 'OFF', weak: 'WEAK', med: 'MED', koz: 'KOZ' });
export const DEFAULT_SCOPE = 'koz'; // #946's default was K.O.Z.

/** Any stored / dispatched value → a scope. #946's 'fixed' is OFF, its 'chaos' (k.o.z.) is KOZ. */
export function sanitizeScope(mode) {
  if (mode === 'fixed') return 'off';
  if (mode === 'chaos') return 'koz';
  return SCOPE_CYCLE.includes(mode) ? mode : DEFAULT_SCOPE;
}

/** The next state in the cycle, wrapping. */
export function nextScope(mode) {
  const i = SCOPE_CYCLE.indexOf(sanitizeScope(mode));
  return SCOPE_CYCLE[(i + 1) % SCOPE_CYCLE.length];
}

const styleIds = new Set(STYLE_LOOKS.map((l) => l.id));
const ORIGINAL_LOOKS = Object.freeze(COMPOSITION_PRESETS.filter((p) => !styleIds.has(p.id)));
const SMALL_VOICES = Object.freeze(VOICE_DECK.filter((v) => v.kind !== 'family'));
/** The pre-#1767 deal: each curated shape set's first four (the 19 sets / 49 assets). */
export const CURATED_SETS = Object.freeze(SHAPE_SETS.map((s) => Object.freeze(s.ids.slice(0, 4))));
const CURATED_ASSETS = new Set(CURATED_SETS.flat()).size;
const LIBRARY_ASSETS = dealableRecords(ASSETS).length;

const DECKS = {
  off: { looks: ORIGINAL_LOOKS, voices: SMALL_VOICES, pool: 'sets', chaos: false, launch: 'factory' },
  weak: { looks: ORIGINAL_LOOKS, voices: SMALL_VOICES, pool: 'library', chaos: false, launch: 'open' },
  med: { looks: COMPOSITION_PRESETS, voices: VOICE_DECK, pool: 'library', chaos: false, launch: 'open' },
  koz: { looks: COMPOSITION_PRESETS, voices: VOICE_DECK, pool: 'library', chaos: true, launch: 'roll' },
};

/** What a scope lets a tap deal: { looks, voices, pool: 'sets'|'library', chaos, launch: 'factory'|'open'|'roll' }. */
export function scopeDecks(mode) {
  return DECKS[sanitizeScope(mode)];
}

/** The honest deck readout beside the pill: assets · looks · voices a tap can reach at this state. */
export function deckReadout(mode) {
  const d = scopeDecks(mode);
  return {
    assets: d.pool === 'sets' ? CURATED_ASSETS : LIBRARY_ASSETS,
    looks: d.looks.length,
    voices: d.voices.length,
  };
}
