import { panelsByZone } from './PanelRegistry.js';

/**
 * Composition root — zero business logic.
 * Renders registry entries by zone. Knows nothing about Davis/Layout/etc.
 * Primary zone = canvas. Secondary zone = stacked panels.
 */
export function Shell({ dispatchPipe, containerRef, gridTemplate, dividerProps }) {
  const primary = panelsByZone('primary');
  const secondary = panelsByZone('secondary');

  return (
    <div className="grid" ref={containerRef} style={{ gridTemplateColumns: gridTemplate }}>
      <div className="col col-canvas">
        {primary.map((p) => {
          const Comp = p.component;
          return <Comp key={p.id} dispatch={dispatchPipe} />;
        })}
      </div>
      <div className="col-divider" {...dividerProps(0)} />
      <div className="col col-panels">
        {secondary.map((p) => {
          const Comp = p.component;
          return <Comp key={p.id} dispatch={dispatchPipe} />;
        })}
      </div>
    </div>
  );
}
