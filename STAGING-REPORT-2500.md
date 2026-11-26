# STAGING REPORT — #2500 (A23): WetLab LINEAGE drive lines are truncated (missing third parent value)

**Branch:** feat/2500-a23 · **Base:** d605f92a (current main) · **Builder verdict: (i), narrowly — the
record's values are never dropped by any lawful path; the one place the line can stand a valueless slot
after a parent's colon is a formatter fall-back that claimed "retained" for a gene the parent's summary
does not hold and printed a bare JS `null` for its value. That fall-back is fixed to name the state in
the surface's own words; everything else is evidence and a pin.**

## 1. The filed observation (issue #2500, verbatim evidence)

> Where: WetLab > LINEAGE.
> Evidence: 'drive.approval: a blend of the parents - cr-420090ca: 1 - cr-b81d5f34: 1 - cr-ccb3100d:'
> (no value after the last colon), same for crowding; strain/boredom show all three values (1-1-1).
> The third parent's value is dropped from approval and crowding lines.

Filed from the 2026-11-24 stress session on hosted build f260b74. Verified first: no commit between
f260b74 and current main (d605f92a) touches the lineage surface, its model, the genome text model, the
breeder, or the assembler door — the code under investigation is identical to the filed build's.

Two cautions about the quote itself, stated plainly: it is a lossy paraphrase of the real line (the
real line reads `drive.approval · <child value> — crossed · a blend of the parents — <p1>: <v1> · …`;
the quote drops the child's own value and the word "crossed"), so "(no value after the last colon)"
cannot by itself distinguish an empty slot from a token the session did not transcribe. The verdict
below rests on what the code provably does, not on the quote's exact typography.

## 2. The surface and the law

The line is the Lineage Tree's crossed-gene delta (`app/src/components/LineageTree.jsx`, `deltaGroups`):
for a gene whose source is `cross:<a>~<b>~<c>`, the suffix is
` — crossed · a blend of the parents — <p1>: <v1> · <p2>: <v2> · <p3>: <v3>`, each `<vi>` the parent's
retained value for that gene, derived by `app/src/components/lineageTree.model.mjs` (`nodeDeltas` →
`geneFrom`) from the child's retained ancestry summary (`record.ancestry`, written once at the birth by
`engine/creatureBreed.js`, never recomputed) and rendered by `geneValueText`
(`app/src/components/genomeTimeline.model.mjs`): a DRIVE gene renders `String(v)` for a number, `'none'`
for a non-number.

Parentage semantics are defined, so the stop-spec branch does not fire: Matt's ruling (2026-10-29,
#1852) — a child has exactly three parents (`BREED_PARENTS = 3`); the four drives (approval, crowding,
strain, boredom) are the continuous genes and blend across all three. There is no lawful two-parent
record; a parent slot can only ever be a value, `'none'` (retained, empty), or `'not retained'`.

## 3. Mechanism — what the record holds, and the one dishonest fall-back

**The values are all recorded, and the door holds them.** The assembler's door
(`sanitizeCreatureRecord`) holds every genome AND every ancestry entry to the birth block — body, head,
limbs, joints, look, voice, material, then the four DRIVE genes in order, each an in-range number
[0.25, 2] — and re-derives every crossed drive at the head of the summary from the head entries' values
(`ancestryAgrees` / `crossedDriveValue`): a head entry missing a drive value, or holding one rewritten,
refuses the record whole. Every write path into the bank was audited (ASSEMBLE and BREED store actions,
deal-strip banking, stage-birth banking, hand edits, project load / autosave / scene apply): all pass
through the door or construct through the breeder/assembler, which sanitize. So no banked record can
carry a parent summary that lacks a drive gene — branch (ii) (never recorded) is excluded for lawful
records, and for lawful records branch (i) (recorded but dropped) does not occur either (measured in §4).

**The one fall-back that stands nothing after the colon.** `geneFrom` answers, per parent per gene,
`{ id, retained, value, valueText, matches }`. The model's own header defines the contract: "the
parents' own values for the gene **wherever they were retained**" — retention is per gene. But when a
parent's entry was retained and the gene was NOT in it, the fall-back answered `retained: !!list` —
**true**, because the entry exists — with `valueText: null`. The component prints
`p.retained ? p.valueText : 'not retained'`, so the line rendered:

```
cr-ccb3100d: null
```

—a valueless slot after the colon (a bare JS null where the parent's value should read), on exactly the
genes the entry lacks and no others: strip approval+crowding from the third parent's entry and approval
and crowding render `cr-<id>: null` while strain and boredom render their values — the filed pattern,
gene for gene. The same fall-back also fed the inherited branch, which would claim a gene
"differs from the retained value" against a value that was never retained.

This shape cannot be produced by the door (§3 above), so it is not claimed that the session's record
carried it — the session's bank is gone and its provenance cannot be reconstructed. What is claimed,
and proven: this fall-back is the only place in the filed line where a parent's slot can stand without
its value or an honest word for its absence; the model is by its own header a view that renders
hand-held records honestly ("a hand-held record still cannot hang the view"), and for this shape it did
not. Every other absent case already names itself: a parent with no entry renders `not retained` (all
four drives alike); a gene retained with an empty value renders `none`.

## 4. Reproduction (measured, on this tree)

- **Engine level:** 22,625 crossed deltas (multi-generation breeding, hand-edited parents, pre-summary
  parents) built through the breeder and read through the real model — every parent slot rendered its
  numeric value; zero valueless slots.
- **Store level:** 1,491 crossed deltas across the session's own acts driven through the real store
  (assemble six founders, twelve breeds, a GENOME REPLACE of a drive gene by donor, MED/KOZ deal-strip
  breeds banked through `bankDealtCreature`) — zero valueless slots.
- **Browser level:** the built app (vite preview) driven by Playwright with the store exposed the e2e
  way; children bred through the store's actions; WetLab → LINEAGE read from the DOM. Actual lines:
  `DRIVE.crowding · 0.729 — crossed · a blend of the parents — cr-29a6f149: 1 · cr-52ae2de6: 1 · cr-cc0e4cee: 0.494`
  — all three values present, the third not a norm value; `scrollWidth == clientWidth` on every delta
  line (no horizontal clipping; the lines wrap, heights 30–45px account for every wrapped line) —
  branch (iii) (visual truncation) excluded for this surface: the full text is in the DOM and on screen.
- **The filed shape, hand-built** (third parent's entry with approval+crowding genes removed, fed
  straight to the model): approval renders `cr-cfc3f0c3: null`, crowding the same, strain and boredom
  render `1` — the valueless slot, reproduced exactly where §3 says it lives.

## 5. The fix (one expression)

`app/src/components/lineageTree.model.mjs`, `geneFrom`'s fall-back: `retained: !!list` → `retained: false`,
with a comment stating the law (retention is per gene, not per entry). Consequences, all in the line's
existing idiom and vocabulary:

- a crossed line for a gene the parent's summary does not hold now prints `<id>: not retained` — the
  surface's own words for an unretained parent (the tree's tiles use the same words for stubs) — instead
  of `<id>: null`;
- an inherited gene whose named parent's summary lacks it no longer claims to differ from a retained
  value (its suffix is simply absent, as it already is for a stub parent).

For every record the door admits, the deltas are byte-identical to base: the fall-back's new branch is
reachable only when an entry lacks a gene, which the door refuses (pin group "corpus" + the existing
`lineageTree` suite are the witnesses). No record, write path, or stored value changes; records already
banked are untouched and render exactly as before. One-writer files untouched
(`liveLoop.mjs` / `liveResolve.mjs` / `particles.js` byte-identical).

**Census consequence (the A-line's known trap, handled):** the new pin imports the assembler, so
`creatureAssembler.selfcheck`'s stage-side-readers census named it; the pin is registered in that
census's allowed list with its comment, in the list's own form (a test of the tree's model, not a stage
reader) — the same registration every suite in that list carries.

## 6. Pin

`app/src/components/lineageThirdParent.selfcheck.mjs` (manifest-registered after
`lineageTree.selfcheck.mjs`), 5 groups; assertion messages carry the actual rendered strings. The parts
builder mirrors `LineageTree.jsx`'s crossed/inherited branches verbatim (the component is JSX and
cannot be imported by a node suite); the model objects it consumes are the real ones.

- **values** — a real bred child with crossed approval AND crowding: every crossed drive names three
  parents and renders each one's recorded value (`<id>: <value>`), no empty token anywhere in the line.
- **missing** — the filed shape (third parent's entry stripped of approval+crowding): the slot reads
  `retained: false` and the line prints `<id>: not retained`; no `null` anywhere in the line; the same
  parent's strain/boredom values still render (the defect was per gene).
- **missing (inherited)** — an inherited gene whose named parent's entry lacks it: no
  "differs from the retained value" claim.
- **tokens** — the standing honest tokens survive: a pre-summary record's stub parents read
  `not retained` on every drive; a gene retained with an empty (null) value reads `none`.
- **corpus** — bred families across seeds and generations: every crossed part matches
  `<id>: <number>` (the no-regression witness for door-clean records).

**Discrimination (demonstrated in a scratch worktree at pristine base d605f92a, node_modules installed,
pin only, removed after):** the pin FAILS on base in the "missing" group for the filed reason —
`approval: the third parent's unretained gene reads as unretained (got retained=true, valueText=null)` —
and passes 5/5 on this branch. The "values", "tokens" and "corpus" groups pass on base too: they are
the invariant half of the evidence (the lawful paths were never broken).

## 7. Verification

- Pin: 5/5 PASS on the branch; base failure as §6.
- Neighbours (every suite naming a touched file, plus the WetLab/cultivation family):
  lineageTree PASS · lineageThirdParent PASS · genomeTimeline PASS · genomeMaterial PASS ·
  creatureAssembler PASS (after the census registration, §5) · creatureBreed PASS · cultivate PASS ·
  wetLab PASS · hornLines PASS · shapeMix PASS · uiRegistry PASS.
- format:check — clean. lint — 0 errors (11 warnings, the pre-existing set on base).
  build — ✓ built in 9.26s.
- Full manifest sweep: **839 PASS / 6 FAIL** over all 845 manifest commands (log kept in the
  worktree during the run). The six failures classify as follows, each with its evidence:
  - `swarmWasm` (exit 1), `rollSafety` (exit 1), `accum` (abort) — the documented
    sandbox-environmental set, A/B-proven identical on pristine main by this line's standing
    record and untouched by this change (none loads the lineage model).
  - `accumFreezeClear`, `pausedRecallPresent`, `bgWhiteScene` — browser suites that failed
    inside the sweep under contention (300 s per-command cap on a shared 1.5-CPU sandbox).
    Standalone tiebreakers on this branch, run with nothing else competing: accumFreezeClear
    PASS (10 groups), pausedRecallPresent PASS (18 groups), bgWhiteScene PASS (11 groups).
    bgWhiteScene was A/B'd explicitly because its first standalone run also failed (at
    "shuffled white grid — marks missing on white", a frame read of a nearly uniform frame):
    on pristine base d605f92a it fails too, at a different presentation group ("frozen white
    grid — held frame blank"), and on this branch it then passes in full — a
    presentation-timing suite whose sandbox verdict moves run to run in both directions,
    never near this diff (it reads BG palette rendering; nothing it loads imports the lineage
    model). CI remains authoritative for it, as for the whole browser family.
- One-writer files byte-identical to base; diff is the model expression + comment, the census
  registration, the new pin, one manifest line, and this report.

## 8. Lane recommendation

**Review lane.** The production change is one expression in the tree's model; for every record the
door admits the rendered lines are byte-identical (pin corpus + existing suites), so there is nothing
new for Matt to look at on a lawful bank — but it changes what a performer-facing line prints for the
one dishonest shape, and this line's discipline sends rendering-surface fixes to his lane. Review this:
open WetLab → LINEAGE on any bred child — the drive lines read exactly as before; the change is
provable by the pin (a parent summary missing a gene now names the parent 'not retained' on that gene's
line instead of standing a null after its colon).
