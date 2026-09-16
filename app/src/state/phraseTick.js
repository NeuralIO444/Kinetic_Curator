// Pure phrase clock. UI arms; this function only advances beat / wrap.

export function tickPhraseBeat(state, hooks = {}) {
  if (!state.phraseEnabled) return {};
  const length = Math.max(2, state.phraseLength || 8);
  const nextBeat = (state.phraseBeat || 0) + 1;
  if (nextBeat < length) return { phraseBeat: nextBeat };

  const origin = state.phraseOriginSeed != null ? state.phraseOriginSeed : state.seed;
  const updates = {
    phraseBeat: 0,
    phraseWrapGen: (state.phraseWrapGen || 0) + 1,
    phraseDidWrap: true,
  };

  if (state.phraseMode === 'cycle-seed') {
    updates.seed = (origin + 1) >>> 0;
    updates.phraseOriginSeed = updates.seed;
    return updates;
  }

  if (state.phraseMode === 'step-ca') {
    const step = hooks.stepGrid;
    const create = hooks.createGrid;
    if (typeof step === 'function') {
      updates.caGrid = state.caGrid ? step(state.caGrid) : (typeof create === 'function' ? create(40, 28) : state.caGrid);
    }
    updates.seed = origin;
    return updates;
  }

  updates.seed = origin;
  return updates;
}
