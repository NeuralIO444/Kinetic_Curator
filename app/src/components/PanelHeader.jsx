// Shared PanelHeader component — panel chrome used by all 7 panels
import { useCollapse } from '../hooks/useCollapse.js';

export function PanelHeader({ tag, title, subtitle, collapsed, onToggle, children }) {
  const isCollapsible = typeof onToggle === 'function';

  return (
    <div
      className={`panel-header ${isCollapsible ? 'panel-header-collapsible' : ''} ${collapsed ? 'panel-header-collapsed' : ''}`}
      onClick={isCollapsible ? onToggle : undefined}
    >
      <div className="panel-header-left">
        {isCollapsible && (
          <span className="panel-collapse-caret">{collapsed ? '▶' : '▼'}</span>
        )}
        {tag && <span className="panel-tag">{tag}</span>}
        <span className="panel-title">{title}</span>
        {subtitle && <span className="panel-subtitle">{subtitle}</span>}
      </div>
      <div className="panel-header-right" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
