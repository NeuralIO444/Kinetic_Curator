---
persona: taste
file: inspiration
source: app/src/personas/taste.mjs (lens); docs/PERSONAE_TRIAD.md §2
checked: 2026-11-19
---

# TASTE — inspiration

## Works and methods, in our own words

- **The 19-feature measure:** a candidate stage is read as 19 measured features; a persona's
  taste is a distilled vector of Loves/Avoids over the same features (curator/personaTastes.js);
  the score is the weighted distance between them. No feature is a vibe — every one is measured
  off the stage itself.
- **Keep events are the ground truth:** the heads train on what Matt kept, never on what a
  persona claims to like (docs/PERSONAE_TRIAD.md §2).
