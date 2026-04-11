// src/webview/main.tsx
// Point d'entrée React de la webview
// Voir docs/PHASE2.md §2.1

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{
          padding: 32, fontFamily: 'monospace', color: '#e84040',
          background: '#1d2433', minHeight: '100vh',
        }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            ⚠ Jenkins Node Editor encountered an error
          </div>
          <pre style={{ fontSize: 12, opacity: 0.8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {(error as Error).message}
            {'\n\n'}
            {(error as Error).stack}
          </pre>
          <div style={{ marginTop: 16, fontSize: 12, color: '#8a9bb5' }}>
            Try reloading the editor (Ctrl+Shift+P → Developer: Reload Window).
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('[Jenkins Node Editor] Root element #root not found in DOM');
}

createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
