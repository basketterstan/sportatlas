import React from 'react';

interface State { hasError: boolean; error?: Error; }

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-ha-bg flex flex-col items-center justify-center gap-6 p-8">
          <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-white font-black uppercase italic tracking-tight text-xl">Er ging iets fout</h2>
            <p className="text-slate-500 text-sm max-w-sm">{this.state.error?.message}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-ha-brand text-slate-950 rounded-xl font-black text-sm uppercase tracking-widest active:scale-95 transition-transform"
          >
            App herladen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
