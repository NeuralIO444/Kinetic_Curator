Coordinator update (2026-10-28, at Matt's order — the hold is lifted, this PR is being landed):

**Rename done: READOUT → TIDES, everywhere the feature's name lives.**
- Mode value `'READOUT'` → `'TIDES'` (PATTERN_MODES, all mode comparisons, e2e expectations, selfcheck mode lists).
- Module `src/pattern/readout.js` → `tides.js`; its selfcheck → `tides.selfcheck.mjs` (manifest line updated); e2e spec → `pattern-tides.spec.js`.
- API renamed in kind: assignTides / rasterTides / tidesCols / tidesCellAt / tidesRoles / tidesBand / tidesTau / tidesValue / tidesCellOf / tidesCells, `TIDES_*` constants, plan `kind: 'tides'`, cost tier `pattern/tides`.
- UI copy in PatternEditor (mode description + hints) and docs/PATTERN_SPEC.md now name TIDES.
- Pre-existing generic "readout" words elsewhere (StressReadout, tape readout, the Param value prop) are not this feature and were left alone.

**One deliberate addition:** a legacy alias in patternTrack — patterns saved while the mode was named READOUT (only possible from this PR's review builds; the feature never shipped) load as TIDES instead of silently falling back to QUILT.

**Branch hygiene:** rebased onto current main (it predated the #1817–#1821 merges, which accounted for part of its red CI). Verified locally on the rebased tree: pattern selfcheck family green (tides, patternTrack, patternEditor, patternRender, patternShuffle, layersPlusPattern), `npm run build` green, repo-wide `format:check` green.

Merging on full green CI per Matt's instruction.
