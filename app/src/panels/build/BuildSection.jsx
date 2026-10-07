// Build section wrapper — UX-5 reorg. One numbered, titled section per
// workflow stage: Layout → Cast → Motion & Behavior → Appearance.
// docs/DESIGN_SYSTEM.md §2.7 — the section numeral is the circled glyph, not a CSS circle.
const CIRCLED = { 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤' };

export function BuildSection({ num, title, children }) {
  return (
    <section className="build-section">
      <h3 className="build-section-title">
        <span className="build-section-num" aria-hidden="true">{CIRCLED[num] || num}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}
