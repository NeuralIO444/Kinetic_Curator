# #1814 — strata soak (WET Phase B) — review evidence

**What shipped:** a CONTENT stratum can be flagged **WET** (BUILD row, beside
the blend modes; default OFF). While the wet field is served, that stratum's
blending is modulated spatially by the field —
`w = mix(w_dry, w_soaked, fieldWetness)` — with the issue's three terms:
(a) the source colour is pre-multiplied by the field's local absorption
(the deposited-pigment KM reflectance from the pig pack; the ground colour
alone when no pigment is deposited), (b) edges smear along the field's
velocity inside the existing composite shader (three taps trailing the flow —
the smear machinery, no new blur pass), and (c) a WET stratum's marks stamp
the field (the wet-frame service now takes `soak` as a named consumer, so a
soak-only scene births the field; clause (c)'s shaping half is documented as
a vacuous antecedent in `docs/WET_ENGINE.md` and the staging report).

Where the field is dry, or the mode is off, or the field is shed
(perfTier1 → mask absent), the output is the ordinary static blend —
**byte-identical**, asserted below. The service contract was not
renegotiated: the gate was already generic over consumer keys; `soak`
joins `accum` as a name.

## Measurements (probe.json has the machine-readable copy)

- **Byte identity:** mode-on + no field = mode-off bytes; mode-on +
  all-zero mask = mode-off bytes; the dry half of a half-wet scene is
  byte-exact vs mode-off on both render shells.
- **Term (a) absorption:** coverage-isolated pixels (a > 0.97 from a
  black/white pair) recover the pigment pack's reflectance per channel —
  pack (64,128,192), recovered ratios within 0.035 of 0.251/0.502/0.753;
  strongest pixel dry 251 → soaked 63 (×0.251 exactly). Without a pigment
  pack, absorption equals the ground colour alone.
- **Term (b) smear:** one isolated mark on white — dry edges [116, 283];
  +flow → [116, 289]; −flow → [110, 283]. One-sided trailing smear; the
  leading edge never moves; the sign follows the velocity.
- **Export parity:** candidate render vs chunked export, WET on —
  byte-identical. Warm-up export (K=90) soaks: flagged ≠ unflagged by
  > 50 px, two runs byte-identical, readout `wet: warm-up K=90`.

## Flagged observation (pre-existing, not this slice)

The live shell and the offline shell already differ on a **bone-dry**
scene in this sandbox (max Δ223, mean Δ2.83 — live-shell resolve-option
defaults). Parity is therefore asserted within each shell, where it is
byte-exact. Worth a look from whoever owns the live shell's resolve
defaults; untouched here.
