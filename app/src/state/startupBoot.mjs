// startupBoot.mjs — #946 startup chaos boot decision.
//
// Pure and wall-clock-free: given the boot inputs, decide what a cold
// launch should do. The hook (useProjectAutosave) applies the decision.
// Kept separate so the selfcheck can pin the whole truth table without
// mounting React.
//
// Decisions:
// - 'shared'      — a share-link fragment was applied: an explicit paste,
//                   it wins over everything and is never rolled over.
// - 'restore'     — apply the saved project, no roll (the ?boot=factory
//                   deterministic entry keeps its historical meaning).
// - 'factory'     — do nothing: the initial store state IS the known,
//                   deterministic opener (seed 0xa17e9b21).
// - 'roll'        — one full wild roll on the fresh initial state.
// - 'restore-roll'— restore the saved project first (it becomes the undo
//                   base — yesterday is one Ctrl+Z away), then one roll.
export function decideBoot({ shareApplied, factoryRequested, startupMode, hasDoc }) {
  if (shareApplied) return { action: 'shared' };
  if (factoryRequested) return { action: hasDoc ? 'restore' : 'factory' };
  if (startupMode === 'fixed') return { action: 'factory' };
  return { action: hasDoc ? 'restore-roll' : 'roll' };
}
