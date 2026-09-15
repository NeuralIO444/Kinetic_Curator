// Shared PanelHeader — static panel chrome.
//
// Collapse lives in the Shell's tab strip, not here. A panel that is on
// screen is the panel you selected; there is nothing to reveal by
// collapsing it, and two competing disclosure controls only cost a click.

export function PanelHeader({ tag, title, subtitle, children }) {
  return (
    <div className="panel-header">
      <div className="panel-header-left">
        {tag && <span className="panel-tag">{tag}</span>}
        <span className="panel-title">{title}</span>
        {subtitle && <span className="panel-subtitle">{subtitle}</span>}
      </div>
      {children ? <div className="panel-header-right">{children}</div> : null}
    </div>
  );
}
