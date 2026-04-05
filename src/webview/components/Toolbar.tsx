// src/webview/components/Toolbar.tsx
// Voir docs/PHASE5.md §5.5

import React from 'react';
import { useReactFlow } from '@xyflow/react';
import { useGraphStore } from '../store/graphStore';
import { useJenkinsAPI } from '../hooks/useJenkinsAPI';

export default function Toolbar() {
  const { fitView } = useReactFlow();
  const { validate, runBuild, abortBuild } = useJenkinsAPI();

  const buildStatus = useGraphStore(s => s.buildStatus);
  const isValidating = useGraphStore(s => s.isValidating);
  const validationErrors = useGraphStore(s => s.validationErrors);
  const isDirty = useGraphStore(s => s.isDirty);
  const toggleLogs = useGraphStore(s => s.toggleLogs);
  const autoLayout = useGraphStore(s => s.autoLayout);

  const errorCount = validationErrors.filter(e => e.severity === 'error').length;
  const warnCount = validationErrors.filter(e => e.severity === 'warning').length;

  const statusLabel: Record<string, string> = {
    idle: '',
    running: '● Building…',
    success: '✓ Success',
    failure: '✗ Failed',
    aborted: '◼ Aborted',
  };

  const statusClass: Record<string, string> = {
    running: 'status-running',
    success: 'status-success',
    failure: 'status-failure',
    aborted: 'status-aborted',
  };

  const btnStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid var(--je-border)',
    color: 'var(--je-fg)',
    padding: '3px 10px',
    fontSize: 12,
    borderRadius: 3,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '5px 12px',
      borderBottom: '1px solid var(--je-border)',
      background: 'var(--je-sidebar-bg)',
      flexShrink: 0,
      minHeight: 36,
    }}>
      {/* Layout */}
      <button style={btnStyle} onClick={autoLayout} title="Auto-layout graph (dagre)">⊞ Layout</button>
      <button style={btnStyle} onClick={() => fitView({ padding: 0.2, duration: 300 })} title="Fit all nodes in view">⊡ Fit</button>

      {/* Séparateur */}
      <div style={{ width: 1, height: 20, background: 'var(--je-border)', margin: '0 4px' }} />

      {/* Dirty indicator */}
      {isDirty && <span style={{ fontSize: 11, opacity: 0.5 }}>●</span>}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Erreurs de validation */}
      {errorCount > 0 && (
        <span style={{ fontSize: 12, color: 'var(--je-error)' }}>
          ✗ {errorCount} error{errorCount > 1 ? 's' : ''}
        </span>
      )}
      {warnCount > 0 && (
        <span style={{ fontSize: 12, color: 'var(--je-warning)' }}>
          ⚠ {warnCount} warning{warnCount > 1 ? 's' : ''}
        </span>
      )}

      {/* Validate */}
      <button
        style={{ ...btnStyle, opacity: isValidating ? 0.6 : 1 }}
        onClick={validate}
        disabled={isValidating}
        title="Validate Jenkinsfile against Jenkins API"
      >
        {isValidating ? '⟳ Validating…' : '✓ Validate'}
      </button>

      {/* Run / Abort */}
      {buildStatus === 'running' ? (
        <button
          style={{ ...btnStyle, borderColor: 'var(--je-error)', color: 'var(--je-error)' }}
          onClick={abortBuild}
          title="Abort running build"
        >
          ■ Abort
        </button>
      ) : (
        <button
          style={{ ...btnStyle, borderColor: 'var(--je-accent)', color: 'var(--je-accent)' }}
          onClick={() => runBuild()}
          title="Trigger Jenkins build"
        >
          ▶ Run
        </button>
      )}

      {/* Status du build */}
      {buildStatus !== 'idle' && (
        <span className={statusClass[buildStatus]} style={{ fontSize: 12, minWidth: 90 }}>
          {statusLabel[buildStatus]}
        </span>
      )}

      {/* Logs */}
      <button style={btnStyle} onClick={toggleLogs} title="Toggle build logs">≡ Logs</button>
    </div>
  );
}
