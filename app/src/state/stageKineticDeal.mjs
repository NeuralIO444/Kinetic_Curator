// state/stageKineticDeal.mjs — #2544: the stage KINETIC press deals creatures and construct recipes.
//
// Until now the wide-deal engines (deal/kineticEngine.mjs) ran only in the WetLab strips; the stage's own
// KINETIC buttons kept their store actions (the engine's header said so, "until Matt orders a change").
// Matt's order is issue #2544 (2026-11-26), with two rulings the same day:
//   - the landing is (a) JOINS THE ROLL: a pool-dealing press (the LOOK pass, the CHAOS roll) re-rolls the
//     stage with the dealt creatures and construct recipes in the mix. Auto-apply and pick-strip landings
//     were declined, not deferred.
//   - ALWAYS IN THE MIX: the deal is not gated — not behind the CONSTRUCTS chip (which keeps its own
//     pool-leading behaviour, untouched) and not behind any other switch. Every pool-dealing press deals.
//
// This module is the pure core; state/slices/layoutSlice.js holds the store wrapper (landStageDeal,
// landBirth's sibling). Given the standing state, this press's number and the enabled map the press is
// about to commit, it runs the engines over the creature and construct adapters with the stage's own
// context and returns what landed — or null when nothing did, so the commit is exactly the press as it
// was (the empty-hand law: a library with no dealable creatures and no style in play deals assets exactly
// as before). No store, no clock, no Math.random, and it never touches the press's rng: a hand is a pure
// function of (standing seed, press number, context), like every KIN pass.
//
// What landing means, mechanically:
//   - a dealt creature stands as a STAGE BIRTH (state.stageBirths, #2037's channel): its tile is built the
//     bank's way (creatureTile over the founder skeleton of its kin) and enabled over the pool the press
//     dealt. It is NOT banked — banking stays the artist's keep, through the same door a born child's keep
//     uses (bankStageBirths; the wrapper notes each dealt creature to the standing take through
//     birthRecord's tap, via 'deal', so a kept take banks it with the take's other births).
//   - a dealt construct recipe is assembled and BANKED (state.constructRecords, through bankConstructRecord
//     — the construct bank's own door: its cap and drop-oldest law, constructs-spec §5), and its tile is
//     enabled over the pool: poolWithConstructs (engine/constructPool.js) draws banked tiles into the stage
//     pool, so a banked construct is a pool citizen the roll can place. A recipe already banked banks
//     nothing new; its tile still joins the roll.
//   - a creature already standing (banked, or stage-born from an earlier press) is never dealt twice.
//
// The scope mapping (issue #2544 item 4 — deliberate, pinned in the selfcheck):
//   - creatures take the stage's own scope (state.startupMode): the creature adapter's ladder IS the
//     stage's ladder (OFF → WEAK → MED → KOZ, ruling Q1 in deal/creatureAdapter.mjs), sanitized through
//     the adapter, so an unknown stage scope falls to the adapter's default exactly as the WetLab's does.
//   - constructs take ANY at every stage scope: the construct ladder names STYLES and the stage pill names
//     widths — there is no honest width→style mapping, so the deal picks a style in play by its own
//     seeded hash, as the ANY scope does in the WetLab.
import { press as kineticPress, sanitizeScope } from '../deal/kineticEngine.mjs';
import { creatureAdapter } from '../deal/creatureAdapter.mjs';
import { constructAdapter, assembleCandidate, CONSTRUCT_ANY } from '../deal/constructAdapter.mjs';
import { dealLibrary, sanitizePress } from '../panels/wetLabDeal.mjs';
import { ASSETS } from '../data/assets/index.js';
import { creatureTile, skeletonFounder } from '../engine/creatureAssembler.js';
import { bankConstructRecord, constructTileId } from '../engine/constructAssembler.js';

/** The adapters' scopes for one stage press, from the stage's width pill (see the header: the mapping). */
export function stageDealScopes(startupMode) {
  return { creatureScope: sanitizeScope(creatureAdapter, startupMode), constructScope: CONSTRUCT_ANY };
}

/**
 * One stage deal. `state` is the standing store state (read, never written); `pressN` this press's number
 * in the deal stream; `commitEnabledAssets` the enabled map the press is about to commit (the dealt pool).
 * `library` may be handed in by a caller that already built it (the selfcheck does, to deal from nothing);
 * by default it is the stage's own deal library — the library plus the artist's imports, dealt the
 * WetLab's way (panels/wetLabDeal.mjs dealLibrary).
 *
 * Returns null when nothing landed, else:
 *   { creatures, constructs, stageBirths?, constructRecords?, enabledAssets? }
 * creatures / constructs are the records that landed (the wrapper notes the creatures to the take);
 * the rest are store fields to spread into the press commit, present only when they changed.
 */
export function resolveStageDeal(state, pressN, commitEnabledAssets, { library: givenLibrary } = {}) {
  const press = sanitizePress(pressN);
  const seed = (state && state.seed) >>> 0;
  const { creatureScope, constructScope } = stageDealScopes(state && state.startupMode);
  const library = givenLibrary || dealLibrary(ASSETS, (state && state.customAssets) || []);
  const byId = new Map(library.map((a) => [a.id, a]));
  const bank = (state && state.creatureRecords) || [];
  const births = (state && state.stageBirths) || [];
  const attach = (state && state.assetAttach) || {};
  const lookId = (state && state.layoutParams && state.layoutParams.composition) || null;
  const voiceId = (state && state.kineticVoiceId) || null;

  const enabled = { ...(commitEnabledAssets || {}) };
  let enabledChanged = false;
  const enable = (id) => {
    if (id && !enabled[id]) {
      enabled[id] = true;
      enabledChanged = true;
    }
  };

  // Creatures: the wide deal over the stage's library, bank and room. A candidate already standing —
  // banked, or stage-born from an earlier press — is skipped, never dealt twice; one whose tile cannot
  // be built is skipped whole (the bank's own rule: no record that cannot reach the stage).
  const standing = new Set();
  for (const r of bank) if (r && r.id) standing.add(r.id);
  for (const b of births) if (b && b.record && b.record.id) standing.add(b.record.id);
  const kin = [...bank, ...births.map((b) => b && b.record).filter(Boolean)];
  const creatures = [];
  const newBirths = [];
  const creatureHand = kineticPress(creatureAdapter, {
    scope: creatureScope,
    seed,
    press,
    ctx: { library, assetAttach: attach, bank, lookId, voiceId },
  }).hand;
  for (const rec of creatureHand) {
    if (!rec || standing.has(rec.id)) continue;
    const tile = creatureTile(rec, byId.get(rec.body) || null, skeletonFounder(rec, kin));
    if (!tile) continue;
    standing.add(rec.id);
    kin.push(rec);
    newBirths.push({ record: rec, tile });
    creatures.push(rec);
    enable(tile.id);
  }

  // Constructs: recipes from the SHAPE shelf's styles in play (the adapter's gate is the floor law —
  // no style in play is an empty hand, never an error). Each recipe is assembled and banked through the
  // construct bank's own door; its tile joins the roll whether the record is new or already banked.
  const shelf = (state && state.shapeShelf) || [];
  const constructCtx = { shelf, findAsset: (id) => byId.get(id) || null, assetAttach: attach };
  let constructRecords = (state && state.constructRecords) || [];
  let bankChanged = false;
  const constructs = [];
  const constructHand = kineticPress(constructAdapter, {
    scope: constructScope,
    seed,
    press,
    ctx: constructCtx,
  }).hand;
  for (const cand of constructHand) {
    const rec = assembleCandidate(cand, constructCtx);
    if (!rec) continue;
    const next = bankConstructRecord(constructRecords, rec);
    if (next !== constructRecords) {
      constructRecords = next;
      bankChanged = true;
    }
    constructs.push(rec);
    enable(constructTileId(rec.id));
  }

  if (!creatures.length && !constructs.length) return null;
  return {
    creatures,
    constructs,
    ...(newBirths.length ? { stageBirths: [...births, ...newBirths] } : {}),
    ...(bankChanged ? { constructRecords } : {}),
    ...(enabledChanged ? { enabledAssets: enabled } : {}),
  };
}
