// dishFluidRender.mjs — FERROFLUID (#1997): the fluid's matter constants. Pure.
//
// The ferrofluid system is INVISIBLE (Matt's ruling, 2026-11-08): like FLOW's curl field or the
// culture field, it is an underneath system and is never itself drawn — there is no fluid
// texture and no floor pass. What appears on stage as the ferrofluid is a BODY OF ASSETS
// attached to the field, seated where the published density runs high and weighted toward
// the placed magnets, so the body pools in the veins, fills the dense regions and gathers
// at the magnets — the spikes.
//
// #2178 (Full WebGL program #2180, workstream 1) — the body is a GPU channel now, not
// resolver items: this module's original CPU seating (fluidMatterItems — ordinary placement
// items worn from the nearest dealt mark or dealt from the stage pool, capped at
// MAX_FLUID_ITEMS = 480) is RETIRED. Its measured cost (0.84–1.85 ms a frame at the 480 cap,
// O(items × marks) on the wear path) could not carry the Option B read Matt ruled (small
// whole assets at high count — the 8,358-piece mockup), and its items sat inside the hashed
// resolver output. The channel (engine/dishFluidChannel.mjs) seats the body in the vertex
// shader from the published density: pool vocabulary only (the wear path does not port —
// a shader has no spatial search over the frame's marks — and the Option B reference mockup
// is a pool body). What survives here is the matter LAW both paths share: the density floor
// a seat must reach, the stamp's radius and scale terms (the channel's scale base is the
// old law at the dish grid), and the seed-shape vocabulary a pool-less caller falls back to.

/** A seat cell must average at least this much dark phase before matter attaches to it. */
export const MATTER_DENSITY_FLOOR = 0.25;
/** A seated item's stamp radius, in seat cells (the culture's CELL_RADIUS class). */
export const MATTER_CELL_RADIUS = 0.6;
/** Scale of a barely-seated item (at the density floor) relative to a saturated one. */
export const MATTER_SCALE_MIN = 0.45;
/**
 * The module's seed shape vocabulary (the Marks chapter's primitive dots / ring / pit), worn
 * only by a caller that supplies no pool vocabulary of its own — the live resolver always
 * passes the stage's pool (see dishFluidChannel.sanitizeFieldBody). Any pool asset id is
 * safe as matter — the loop bakes atlas cells for the combos the contract actually uses,
 * on demand.
 */
export const FLUID_PRIMITIVE_ASSETS = Object.freeze(['mrk_dots_01', 'mrk_ring_01', 'mrk_pit_01']);
