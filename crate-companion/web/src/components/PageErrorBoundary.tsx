import { Component, type ReactNode } from 'react';

interface State { error: Error | null }

/**
 * If a page hits an error while drawing, show a message with a way out instead of a blank
 * screen. Layout gives it a new key on every page change, so moving to another page resets it.
 */
export class PageErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Page error:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="glass empty" role="alert">
          <span className="mini-disc still" aria-hidden />
          <div>
            <h3>Something went wrong on this page</h3>
            <p className="sub">Try again, or switch to another tab. Your albums and settings are safe.</p>
            <p className="sub small">{this.state.error.message}</p>
            <button className="btn primary" style={{ marginTop: 12 }} onClick={() => this.setState({ error: null })}>Try again</button>
          </div>
        </div>
      </div>
    );
  }
}
