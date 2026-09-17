// ErrorBoundary — catches render errors in child trees
// Fixes B9: malformed SVG in dangerouslySetInnerHTML won't crash the whole app
//
// #107 §3: one throw used to take down the whole Shell — a single bad layer
// or panel unmounted the entire editor, controls included. Nested fail-soft
// means placing one of these around each independent piece (each panel in
// Shell.jsx, each <Layer> in CanvasPanel.jsx) instead of one boundary around
// everything, so a failure stays local to what actually broke.
//
// `fallback`: optional render prop `(error, retry) => node`, for a context
// (e.g. inside an <svg>) where the default DOM fallback below isn't valid
// markup. Pass `() => null` to fail silently there — componentDidCatch still
// logs either way.
// `label`: optional string included in the console.error, since "Render
// error" alone doesn't say which of several nested boundaries caught it.
// `critical`: optional bool (#107 §4) — trips the watchdog (running/evolve
// off, requires manual resume) on top of the local fail-soft above. Only the
// top-level Shell boundary in App.jsx should ever pass this: a per-layer
// boundary escalating into a full trip would defeat the nested fail-soft
// work #107 §3 already did.
import { Component } from 'react';
import { useStore } from '../state/store.js';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary]${this.props.label ? ` ${this.props.label}` : ''}`, error, info.componentStack);
    if (this.props.critical) {
      const label = this.props.label ? ` (${this.props.label})` : '';
      useStore.getState().tripWatchdog(`render-error${label}`);
    }
  }

  render() {
    if (this.state.error) {
      const retry = () => this.setState({ error: null });
      if (this.props.fallback) return this.props.fallback(this.state.error, retry);
      return (
        <div className="error-boundary">
          <div className="error-boundary-icon">⚠</div>
          <div className="error-boundary-msg">
            <strong>Render error</strong>
            <span>{this.state.error.message}</span>
          </div>
          <button
            className="micro-btn"
            title="Clear the error and try rendering again"
            onClick={retry}
          >
            ↻ RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
