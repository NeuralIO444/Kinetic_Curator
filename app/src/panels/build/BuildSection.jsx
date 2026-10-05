// Build section wrapper — UX-5 reorg. One numbered, titled section per
// workflow stage: Layout → Cast → Motion & Behavior → Appearance.
export function BuildSection({ num, title, children }) {
  return (
    <section className="build-section">
      <h3 className="build-section-title">
        <span className="build-section-num" aria-hidden="true">{num}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}
