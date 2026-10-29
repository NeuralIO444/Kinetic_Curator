Closes #1802.

**What changed, plainly:** your button presses now get recorded. Before this, recording a take captured everything *except* FREEZE / CLEAR / SWELL — play the take back and it ran under whatever state the loop happened to be in, because the presses left no trace in the file. Now a take carries its gestures, and playback re-fires each one at its recorded frame, through the same path a live press takes. The buttons themselves are untouched: same panel, same hold, same swell — per Matt's 2026-10-28 narrowing ruling on this issue.

**Proven gap, then fixed:** the recorder's taps see resolver inputs/outputs only, and the gestures act on the loop beside the resolver. Probe before wiring: four gestures fired mid-take, the finished take held none of them. After: record→replay round trip is pinned by the new suite.

**How:** a `gestures` section in the take (the route section's shape): the recorder subscribes to the gesture bus during the take, seeded with the loop's actual frozen state at record start; playback validates the section fail-closed, asserts the take's freeze state at load and at any seek landing, and re-emits each gesture on the bus at its frame. Emissions from playback are stamped so a take can never record its own playback. Takes recorded before this section existed play exactly as before.

**Verification (coordinator-run, incl. recovery audit):** the builder was killed mid-work by a runtime restart; the coordinator audited the tree line by line, completed the missing format pass + staging record, and re-ran everything: gestureRecord.selfcheck **10 checks passed** (also re-verified after rebase onto current main), playback / routeRecord / midi suites OK, `npm run build` green. Full record: STAGING-REPORT.md in this PR.

Built and landed under the 2026-10-28 full-auto arm (ACCUM shelf, slice 3 — narrowed).
