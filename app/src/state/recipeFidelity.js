// #2325 (R5, spec §3.5) — the fidelity proof. A kc-r/3 link may carry `f`: a hash of frame 0 of the scene it
// encodes. After the receiver applies the link, it hashes ITS frame 0 and compares; a difference means the same
// recipe dealt a different stage (another build, another asset set, a changed default) and the notice says so.
// It is diagnostic only: it never blocks the apply, and a link without `f` (every older link) is never checked.
//
// What is hashed: the project doc, resolved the way the running instrument resolves it — a FRESH live resolver
// (gl/liveResolve, the same pure function the loop calls) on the doc's scene at frame 0 (no audio, no beat, no
// motion clock), then buildSceneContract over that frame with the doc's light, world and kinemes. Every scene field
// that changes what frame 0 draws (seed, palette + overrides, layout, assets, light, world, kinemes, canvas) changes
// the hash. The kernel replayer is NOT used: it replays seed + an event log, never the store scene, so its frame
// hashes could not see a dropped scene field. studio/render.mjs is not used either: it is Node-only (node:fs).
//
// Heavy modules (the resolver, the contract builder) load on first use so the recipe codec stays light.

/** The notice a receiver sees when its frame 0 differs from the one the link was made from. */
export const FIDELITY_NOTICE = "Scene differs from sender's build";

const HASH_RE = /^[0-9a-f]{16}$/;

/** True for a well-formed frame-0 hash (16 lowercase hex chars). */
export const isFrame0Hash = (v) => typeof v === 'string' && HASH_RE.test(v);

/**
 * The frame-0 hash of a project doc (serializeProject output), 16 hex chars; null when it cannot be computed
 * (a doc the resolver refuses). Never throws: a proof that cannot run is not an error for the person.
 */
export async function sceneFrame0Hash(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  try {
    const [{ createLiveResolver }, { buildSceneContract }, { resolvePalette }, { frameHash }] = await Promise.all([
      import('../gl/liveResolve.mjs'),
      import('../gl/sceneContract.js'),
      import('../data/palettes.js'),
      import('../gl/performanceFile.mjs'),
    ]);
    const layers = createLiveResolver().resolveLayers({
      // the resting frame: no loop clock, no audio, no governor shedding, the default view scale
      loopTimeMs: 0,
      dtSec: 1 / 60,
      lockedParams: {},
      batchPaused: false,
      focusSwap: false,
      perfClampOverride: null,
      perfTier1: false,
      assetThin: false,
      slowRender: false,
      scaleMul: 1,
      alphaBoost: 0,
      effectiveScale: [0.5, 1.5],
      effectiveAlpha: [20, 100],
      phraseWrapGen: 0,
      attractor: null,
      userPalettes: [],
      customAssets: [],
      assetWeightOverrides: {},
      quality: 'balanced',
      ...doc,
    });
    const contract = buildSceneContract({
      doc: {
        seed: doc.seed,
        seedOffsets: doc.seedOffsets,
        quality: doc.quality || 'balanced',
        layers: doc.layers,
        light: doc.light,
        world: doc.world,
        assetKineme: doc.assetKineme,
        kinemeTime: 1.5, // a kineme at t=0 is at rest and would be invisible to the proof; 1.5 s is a fixed sample of its motion
        palette: resolvePalette(doc.paletteId || 'praystation', doc.paletteOverrides || null),
        regionKinemes: doc.regionKinemes,
        customAssets: doc.customAssets,
        slowRender: false,
        reducedMotion: false,
      },
      resolvedLayers: layers,
      caps: null,
      accum: null,
    });
    return frameHash({ layers, contract });
  } catch (err) {
    if (typeof window !== 'undefined' && window.__KC_EXPOSE_STORE === true) {
      console.warn('[fidelity]', String(err && err.stack ? err.stack : err));
    }
    return null;
  }
}

/**
 * Compare a link's `f` with the receiver's frame 0. Returns null when there is nothing to say (no `f`, or the
 * receiver's hash could not be computed), else { match, sent, got }.
 */
export async function checkFrame0(sentHash, receiverDoc) {
  if (!isFrame0Hash(sentHash)) return null;
  const got = await sceneFrame0Hash(receiverDoc);
  if (!got) return null;
  return { match: got === sentHash, sent: sentHash, got };
}

/**
 * After a recipe has been applied: the notice to show, or null. `state` is the store state AFTER the apply.
 * Only a recipe that carries `frame0Hash` is checked; a mismatch returns FIDELITY_NOTICE.
 */
export async function fidelityNotice(recipe, state) {
  if (!recipe || !isFrame0Hash(recipe.frame0Hash) || !state) return null;
  const { serializeProject } = await import('./projectDocument.js');
  const check = await checkFrame0(recipe.frame0Hash, serializeProject(state));
  return check && !check.match ? FIDELITY_NOTICE : null;
}

// Test hook (same shape as store.js's `window.__KC_EXPOSE_STORE`): inert in production, never read by the app. The
// e2e (recipe-fidelity.spec.js) asks the page for ITS frame-0 hash of whatever is on the stage right now.
if (typeof window !== 'undefined' && window.__KC_EXPOSE_STORE === true) {
  window.__kcFrame0Hash = async () => {
    const [{ useStore }, { serializeProject }] = await Promise.all([
      import('./store.js'),
      import('./projectDocument.js'),
    ]);
    return sceneFrame0Hash(serializeProject(useStore.getState()));
  };
}
