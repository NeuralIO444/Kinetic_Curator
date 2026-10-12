# DLC Discovery — Look Awareness

**Date:** 2026-10-12  
**Status:** Spec. Assumes libraryWatch module that does not exist yet.

## libraryWatch

Native FSEvents (macOS) watches `looks/` and `voices/` folders. Dropping a `.kclook` or `.kcvoice` installs it automatically — no manual refresh, no restart.

Every Look caches a feature vector at install time using the same `extractFeatures()` the Queen already runs for M1.

- LOIS reads that cached vector against the kept-taste centroid for HUNT and NOD.
- Davis reads it for GRAFT, EMBER, DROWN.
- The Queen reads it per-Look for M8.

No plugin runtime, no sandbox — just a watch, validation, and a cache.

Schema validation at the door: every Look/Voice checked against `kc-voice/1` / `kc-look/1` before load. Bad file rejected with clear error, never silently ignored.
