# KC-1 → Live performance hardware: landscape + fit report

**Date:** 2026-09-30 · **Type:** research only — no code changes · **Repo state:** main `8b7d263`

## TL;DR verdict

KC-1's architecture (browser + WebGL2, DAVIS perform surface, audio-reactive engine) maps cleanly
onto the **club-night VJ tier**, where a laptop + MIDI controller + HDMI is the whole rig. The
missing pieces are all interop, not rendering: **MIDI control in** (#617, open), a **real fullscreen
stage output** (#607, open), and **Syphon out** (#608, open) are the three planned bridges into the
VJ world. Longer term, KC-1 needs shared tempo (Ableton Link / MIDI clock) before it can ride a DJ
set, and unattended kiosk boot before it can live in an installation. Nothing here requires rethinking
the engine — it's all plumbing at the edges.

---

## 1. Hardware ecosystem: what touring VJs actually run

### Compute — the machine that makes pixels
- **Laptops are the default instrument.** Touring A/V performers run MacBook Pro (M-series Max chips
  are the current rider standard — one published A/V rider specifies "MacBook Pro M5 Max 16-inch" as
  the artist-provided system) or RTX gaming laptops (Intel i7 + GTX/RTX, 32GB RAM seen in the wild).
  Resolume's own recommended spec: RTX 4070 / Apple M2 Max, 16GB RAM, fast SSD.
- **Mac Studio as a fixed VJ box.** A published festival technical rider lists "Resolume Arena 7 on
  Mac Studio M2 Ultra" as the secondary content source — Apple Silicon boxes are now legitimate
  fixed-install VJ machines.
- **Media servers for the big rooms.** disguise gx 2c (4× 4K outputs) is the rider-grade standard;
  Pixera-class servers sit in the same bracket. These are $50k+ boxes, rented not bought, run by crew.
- **What matters:** GPU (texture throughput), number of physical video outputs, and reliability
  (gig laptops run bare-minimum installs — no updates, no notifications, sleep disabled).

### Software mixers — where sources become a show
| Software | Role | Price (USD, approx) | Notes |
|---|---|---|---|
| **Resolume Arena** | The industry standard: clip mixing + projection mapping + DMX | ~$845 (€799) | Edge blending, SMPTE, Art-Net/DMX fixture output, Syphon/Spout/NDI in |
| **Resolume Avenue** | VJing without mapping | ~$315 (€299) | Same engine, no Arena-only features |
| **VDMX 6** | Mac-only modular mixer, HAP native | $199 | Beloved for custom interfaces, deep MIDI/OSC |
| **MadMapper** | Projection mapping + LED | ~$505 (€479) | The mapping specialist; pairs with any mixer |
| **TouchDesigner** | Node-based generative/A/V installations | $600 commercial (free non-commercial) | The "build your own instrument" path — closest in spirit to KC-1 |

Pattern: Resolume is the *mixer* everything feeds into; TouchDesigner/VDMX are the *generators*.
KC-1 is a generator — its natural slot is "weird source #3" in someone's Resolume composition,
arriving over Syphon/Spout/NDI.

### Control surfaces — hands on the instrument
- **Akai APC40 mkII is the classic VJ controller**: 5×8 clip grid, 8 faders, 16 knobs, crossfader —
  clip launching + fades + FX in one surface. Resolume's forum consensus: "best of both worlds";
  the APC mini is the budget version.
- **Novation Launchpad** for clip-heavy/BPM-synced sets (grid of pads); **Korg nano series** for
  fader-heavy corporate/scenic work.
- **Mapping is a craft**: Resolume MIDI presets are XML files; serious performers build 100–200
  shortcut maps with pad color feedback (MIDI out drives the LEDs). One physical control often fans
  out to multiple targets.
- **OSC / TouchOSC / tablets**: iPad-based custom layouts (VDMX-style) for bespoke control; OSC stays
  relevant because it's network-transparent — control the rig from FOH over WiFi.

### Projection & display
- **Lumens tiers (rental market):** 3–4k (small rooms, $200–350/day) → 5–7k (clubs, $400–700/day) →
  10k+ (large venues, $800–1,500+/day) → 20k+ laser (outdoor/monumental; Panasonic PT-RZ21K 20,000 lm
  is a named rider item). Indoor rule of thumb: 5,000–10,000 lumens; outdoor: 20,000+.
- **LED walls** have largely replaced projection at festival scale: ROE Black Pearl panels, Brompton
  Tessera processors (8.8 Mpx capacity), proprietary (non-IP) data distribution. The wall is a fixed
  raster the media server must match exactly — no "auto" anything.
- **Mapping**: MadMapper is the standard for warping content onto architecture/objects; Resolume Arena
  does mapping + edge blending natively.

### Signal flow — getting pixels from A to B
- **HDMI/SDI** are the physical truth. HDMI for short runs; SDI (via Blackmagic capture/output cards)
  for long runs. Format-lock everything (1080p59.94 or 1080p50) — no auto-detect on show day.
- **Same-machine texture sharing:** Syphon (macOS) / Spout (Windows) — zero-copy GPU texture handoff
  between apps. This is how a browser/Electron visual app becomes a Resolume source: the Cables
  ecosystem does it with a Swift sidecar (readPixels → local socket → Metal Syphon server); Loom
  (browser-based WebGPU compositor) ships Syphon In/Out in its Electron build.
- **NDI** for network video between machines (a Resolume forum staple: "NDI Scan Converter can grab
  your browser window"; OBS → NDI/Spout/virtual-cam is the standard poor-man's bridge today).
- **Capture cards**: Blackmagic/AJA/Datapath — Resolume and VDMX take them as native inputs.

### Audio sync — riding the music
- **Ableton Link** is the lingua franca: shared beat/tempo/phase over the local network, no host,
  no config. Resolume, TouchDesigner, VDMX, Ableton Live all join the same session. (SMPTE timecode
  is for frame-exact sync; Link is for beat sync — different jobs.)
- **MIDI clock** (24ppqn) from CDJs/DJ mixers is the fallback; **tap tempo** is the emergency fallback.
- **Audio analysis** inside the visual app (FFT → low/mid/high bands, RMS, onset/beat detection) is
  universal — every major VJ tool does FFT-to-3-bands as the foundation.
- Notable: *none* of the major VJ tools do automatic downbeat detection — manual phrase sync is the
  norm. Anything better than tap-tempo is already ahead of the field.

### Lighting/DMX integration
- **Resolume Arena outputs DMX via Art-Net** (network) and Enttec USB devices; fixtures are patched
  in its Advanced Output — a pixel region's average color becomes DMX channel values (white = 255).
  It's aimed at LED washes/pixel tape, not moving heads (those need workarounds).
- **Enttec DMX USB Pro** is the classic single-universe USB dongle; Art-Net nodes bridge to real
  DMX universes over Ethernet.
- The serious pattern is *not* visuals-driving-lights directly — it's a lighting console (grandMA,
  QLC+, Onyx) receiving triggers, or pixel-mapping LED tape as a low-res video surface. One live rig
  documented in 2026 drives Art-Net pixel controllers *directly* from the visual app, treating a
  24-universe LED rig as a 24×170 image — the "rig is a raster" approach.

### Redundancy — the show must go on
- **Two laptops, always.** The gig laptop runs a bare-minimum install; the backup is a clone
  (Carbon Copy Cloner-style) that also serves as notes machine. Failure drill: emergency content
  plays while you reboot; if it crashes twice, you switch machines.
- **Festival grade:** mirrored understudy media server on the same timecode, output pre-wired to a
  switcher input (5–15s recovery); backup switcher fed by an SDI distribution amp with a physical
  A/B changeover (one action moves the whole show). Failover is rehearsed with a stopwatch.
- **VJ-tier version:** a second laptop with the same project, or simply a Resolume/ATEM input holding
  a loop or logo. For a generative instrument like KC-1, the honest redundancy story is "the mixer
  downstream holds a slate" — the switcher, not KC-1, is the failover point.

---

## 2. Three rig tiers

### Tier 1 — Bedroom / streamer (~$500–2,000, mostly owned gear)
Laptop you already own + OBS (free) + a secondhand projector or big TV + a Launchpad Mini or APC
mini (~$100–150). KC-1 runs in a browser window, captured via OBS browser source or window capture,
streamed or projected over HDMI. No switcher, no redundancy beyond "restart the laptop."
*This tier works with KC-1 today.*

### Tier 2 — Club night (~$3,000–10,000)
MacBook Pro M-series or RTX gaming laptop ($2–3.5k) · Resolume Avenue/Arena ($315–845) ·
Akai APC40 mkII (~$400) · Blackmagic ATEM Mini Pro/Extreme ($595–1,249, 4–8 HDMI inputs) ·
5,000–7,000 lumen projector (rented, $400–700/night) · small LED wash or pixel tape on Art-Net.
Signal: KC-1 → Syphon → Resolume (as a generative layer) → HDMI → ATEM → projector/LED processor.
Audio: DJ mixer feed into the laptop for FFT analysis; Ableton Link joins the booth network for tempo.
Backup: second laptop with the same Resolume project, or the ATEM holding a logo slate.
*This is KC-1's natural habitat — every gap in §4 is about slotting into this tier.*

### Tier 3 — Festival / main stage ($25,000+/night, rented + crewed)
disguise gx 2c media server (primary + frame-locked understudy) · Resolume Arena on Mac Studio as
secondary source · ATEM Constellation 4K or Ross Carbonite switcher (+ backup on A/B changeover) ·
20,000-lumen laser projectors or ROE LED wall + Brompton processors · full lighting rig on grandMA
with timecode. KC-1 appears here, if at all, as a *source* — Syphon/NDI into the media server,
operated by its own performer, or as pre-rendered content. Nobody runs a browser tab as the
program feed at this tier; the media server is the program feed.

---

## 3. KC-1 fit and gaps

### What KC-1 already has
- **Browser + WebGL2 instrument** — runs anywhere Chrome runs; zero-install is a genuine touring
  advantage (borrow any machine, open the URL).
- **DAVIS panel as perform surface** — EVOLVE, beat routing, vibe presets: the "play the instrument"
  layer exists (`app/src/panels/davis/`).
- **Real audio analysis** — `useAudioInput` hook: FFT bands, beat detection, envelope ballistics
  (attack/release shaping, #306). This is the same foundation every VJ tool builds on.
- **Planned, specced, not built** — the Pipeline plan (`docs/PIPELINE_PLAN.md`) already designs the
  three bridges: **#607** fullscreen stage window (Tauri second window, display picker, Fit/Fill/1:1,
  blackout, test pattern), **#608** Syphon output (server name + toggle, runs alongside fullscreen),
  **#617** MIDI learn (Web MIDI, Ableton-style learn mode, triggers + CC macros, mappings persist in
  the project doc; OSC explicitly parked). All three are OPEN.

### Gaps (honest)
1. **No MIDI input at all.** #617 is spec-only. Without it KC-1 can't be played from an APC40/Launchpad
   — the defining gesture of live VJing.
2. **No stage output.** #607 is spec-only. Today the canvas lives inside the app window; getting it to
   a projector means fullscreening a browser tab (fragile: notifications, sleep, wrong display).
3. **No Syphon/Spout/NDI.** #608 is spec-only, and Syphon can't be done from a web page — it needs a
   native path (Tauri sidecar, like the Cables Swift-daemon pattern). No Tauri shell exists in the repo
   yet, so #607 and #608 share one prerequisite: the native wrapper.
4. **No shared tempo.** Beat detection is internal-only. No Ableton Link, no MIDI clock in — KC-1
   cannot lock to the DJ's tempo, which is table stakes for riding a set (tap-tempo at minimum).
5. **Canvas is 1000×700, baked in.** Per `docs/PIPELINE_PLAN.md` "Engine realities": the raster is
   baked into the scene contract, atlas, accum buffers, and export paths. Real output resolutions
   (1080p, 9:16, LED rasters) are engine work (Phase A), not a panel toggle.
6. **No unattended boot.** The FirstRunOverlay blocks on a localStorage flag; there's no kiosk/headless
   mode (the OOH research, `kc-ooh-html5-research.md`, specifies the same gap: `?ooh=1`-style boot).
7. **NDI is parked** (by plan, until a perf-tested case earns it) and **OSC is parked** (#617).
8. **No DMX/Art-Net out.** Visuals-driving-lights is out of scope for now — correctly, per the scope
   lock; Resolume downstream covers it.

---

## 4. Recommendations (sequenced, smallest first)

1. **Build #617 (MIDI learn) first.** Smallest, highest live-performability ROI. An APC40/Launchpad
   turns KC-1 from a mouse instrument into a stage instrument; Web MIDI needs no native shell and
   the spec is already written. This is the one that makes everything else worth doing.
2. **Stand up the Tauri shell, then #607 (fullscreen stage).** The native wrapper is the shared
   prerequisite for #607 and #608 — do it once. "HDMI is a cable, not a toggle" (per the plan):
   a borderless stage window on a picked display with blackout is what makes KC-1 a real stage
   source instead of a browser tab.
3. **#608 (Syphon out) via a native sidecar.** Follow the proven pattern (Cables' Swift daemon,
   Loom's Electron Syphon): readPixels over a local socket to a Metal Syphon server. This is what
   puts KC-1 *inside* Resolume/MadMapper/OBS as a first-class generative source — the tier-2 slot.
4. **Shared tempo: Ableton Link (or MIDI clock in at minimum).** Without it KC-1 plays *alongside*
   the music, never *with* it. Link has a C library (link-c) that can ride in the Tauri sidecar;
   the Carabiner TCP-bridge pattern avoids native compilation entirely. Tap tempo is the stopgap.
5. **Kiosk boot (`?kiosk=1`: skip overlay, fixed seed, no interaction).** Shared with the OOH track —
   one build serves installations and unattended stage boxes. Do it when #607 lands, not before.

Explicitly **not** recommended now: NDI (parked by plan — earn it with a perf-tested case), DMX out
(Resolume downstream covers it; scope lock holds), Spout/Windows (no Windows story in the repo yet).

---

## Sources

- Resolume feature/price breakdown & Arena-vs-combos comparison:
  https://projectileobjects.com/2025/11/28/resolume-vs-vdmx-vs-madmapper-vs-touchdesigner-which-live-visuals-software-and-why/
- Resolume recommended specs + Syphon/Spout/NDI/DMX connectivity:
  https://www.toolfarm.com/buy/resolume_avenue/
- Festival technical rider (disguise gx 2c, Mac Studio M2 Ultra, Carbonite/ATEM, PT-RZ21K 20k lm,
  ROE/Brompton LED chain): https://github.com/toanaz-ops/project008-soundtech-assist/blob/HEAD/docs/knowledge-base/04-templates-and-matrices/Technical-Rider-Spec.md
- A/V performer rider (MacBook Pro, HDMI 4K/8K out, Xone into house mixer): https://daito.ws/rider/audio-visual-set-v1-dark.pdf
- APC40 as the VJ controller + MIDI preset install pattern:
  https://resolume.com/forum/viewtopic.php?t=13346 ·
  https://github.com/jbrick2070/resolume-cowork-helper-mcp-automation/blob/HEAD/README.md
- Browser → Resolume via OBS/NDI/Spout: https://resolume.com/forum/viewtopic.php?t=20358
- Cables Electron Syphon-out sidecar architecture:
  https://github.com/uuoocl/cablesstudio/blob/HEAD/backup/Ops.Extension.Standalone.SwiftSidecars.SyphonOut/Ops.Extension.Standalone.SyphonOut.md
- Loom (browser WebGPU) Syphon In/Out in desktop build:
  https://github.com/laubsauger/loom/blob/HEAD/README.md
- Ableton Link for beat sync (Resolume team) + Link integration patterns:
  https://resolume.com/forum/viewtopic.php?t=18359 ·
  https://github.com/greenjon/liquid-lsd/blob/HEAD/docs/developer/interop_roadmap.md
- VJ audio-visual mapping conventions (FFT→3 bands as universal foundation):
  https://github.com/sethdrew/led/blob/HEAD/library/arch-impl/axis7-perceptual/VJ_AUDIO_VISUAL_MAPPING.md
- Resolume DMX/Art-Net fixture output + Enttec:
  https://resolume.com/forum/viewtopic.php?t=18720 · https://resolume.com/forum/viewtopic.php?t=19597
- Backup/redundancy practice (two laptops, understudy servers, A/B switcher failover):
  https://djlou.tech/backup-and-redundancy-in-your-rig/ ·
  https://github.com/toanaz-ops/project008-soundtech-assist/blob/HEAD/docs/knowledge-base/04-templates-and-matrices/Risk-Contingency-Matrix.md
- Projector lumens tiers + rental rates:
  https://www.opusrentals.com/why-87-of-party-hosts-get-projector-rentals-wrong-and-how-to-get-it-right/ ·
  https://www.accio.com/plp/cost-of-projection-mapping-equipment-for-events
- ATEM Mini Extreme specs ($1,249, 8×HDMI):
  https://www.blackmagicdesign.com/api/print/to-pdf/products/atemmini/techspecs/W-APS-17?filename=atem-mini-extreme-techspecs.pdf
- Max Cooper on laptop-based A/V touring rigs:
  https://www.musicradar.com/artists/every-show-is-designed-for-the-space-so-every-show-is-different-max-cooper-explains-the-workings-of-his-unique-3d-av-live-shows
- KC-1 repo: `docs/PIPELINE_PLAN.md`, issues #607, #608, #617, `app/src/hooks/useAudioInput.js`
