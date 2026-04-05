// src/webview/components/LogPanel.tsx
// Voir docs/PHASE5.md §5.4

import React, { useEffect, useRef } from 'react';
import { useGraphStore } from '../store/graphStore';

export default function LogPanel() {
  const logs = useGraphStore(s => s.logs);
  const buildStatus = useGraphStore(s => s.buildStatus);
  const clearLogs = useGraphStore(s => s.clearLogs);
  const toggleLogs = useGraphStore(s => s.toggleLogs);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const statusColors: Record<string, string> = {
    idle: 'var(--je-fg)',
    running: 'var(--je-warning)',
    success: '#4ec9b0',
    failure: 'var(--je-error)',
    aborted: 'var(--je-badge-fg)',
  };

  return (
    <div style={{
      height: 220,
      borderTop: '1px solid var(--je-border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 12px',
        borderBottom: '1px solid var(--je-border)',
        background: 'var(--je-sidebar-bg)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: statusColors[buildStatus], fontWeight: 500 }}>
          Build output — {buildStatus}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={clearLogs} style={{ background: 'transparent', border: 'none', color: 'var(--je-fg)', opacity: 0.6, cursor: 'pointer', fontSize: 11 }}>
            Clear
          </button>
          <button onClick={toggleLogs} style={{ background: 'transparent', border: 'none', color: 'var(--je-fg)', opacity: 0.6, cursor: 'pointer', fontSize: 13 }}>
            ✕
          </button>
        </div>
      </div>

      {/* Log content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '6px 12px',
        fontFamily: 'var(--vscode-editor-font-family, "Courier New", monospace)',
        fontSize: 12,
        lineHeight: 1.5,
        background: 'var(--je-terminal-bg)',
        color: 'var(--je-terminal-fg)',
      }}>
        {logs.length === 0 ? (
          <span style={{ opacity: 0.4 }}>No output yet. Click ▶ Run to start a build.</span>
        ) : (
          logs.map((line, i) => (
            <div
              key={i}
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: line.startsWith('[ERROR]') || line.includes('ERROR:')
                  ? 'var(--je-error)'
                  : line.startsWith('[WARN]') || line.includes('WARN:')
                  ? 'var(--je-warning)'
                  : 'inherit',
              }}
            >
              {line}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
