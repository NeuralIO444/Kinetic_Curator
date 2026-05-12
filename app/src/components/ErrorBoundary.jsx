// ErrorBoundary — catches render errors in child trees
// Fixes B9: malformed SVG in dangerouslySetInnerHTML won't crash the whole app
import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-icon">⚠</div>
          <div className="error-boundary-msg">
            <strong>Render error</strong>
            <span>{this.state.error.message}</span>
          </div>
          <button
            className="micro-btn"
            onClick={() => this.setState({ error: null })}
          >
            ↻ RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
