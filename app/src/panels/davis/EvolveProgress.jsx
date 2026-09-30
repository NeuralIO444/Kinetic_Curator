// EVOLVE progress (#616): what the machine is doing. Running: the generation,
// the candidate seed on screen, the real seconds-per-generation, candidates seen.
// Stopped: the last run's summary (or an honest idle). Reads the store's own
// evolve facts (davisSlice.js + data/evolveProgress.js), never a timer of its own.
import { useStore } from '../../state/store.js';
import { secPerGen } from '../../data/evolveProgress.js';

export function EvolveProgress() {
  const evolveMode = useStore((s) => s.evolveMode);
  const run = useStore((s) => s.evolveRun);
  const last = useStore((s) => s.evolveLast);
  const seen = useStore((s) => s.evolveSeen);
  const seed = useStore((s) => s.seed);
  const spg = secPerGen(run);
  const cell = (label, value) => (
    <span className="davis-progress-cell"><i>{label}</i><b>{value}</b></span>
  );
  return (
    <div className={`davis-progress ${evolveMode ? 'running' : ''}`} role="status" aria-label="Evolve progress">
      {evolveMode && run ? (
        <>
          {cell('GEN', run.gen)}
          {cell('SEED', seed)}
          {cell('S/GEN', spg == null ? '—' : spg.toFixed(1))}
          {cell('SEEN', seen)}
        </>
      ) : (
        <>
          <span className="davis-progress-idle">
            {last ? `last run: ${last.gen} gen · ${last.seconds.toFixed(0)} s` : 'EVOLVE idle'}
          </span>
          {cell('SEEN', seen)}
        </>
      )}
    </div>
  );
}
