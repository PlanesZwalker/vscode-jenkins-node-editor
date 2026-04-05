// src/webview/components/Toolbar.tsx
// Blue Ocean inspired toolbar

import React, { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useGraphStore } from '../store/graphStore';
import { useJenkinsAPI } from '../hooks/useJenkinsAPI';

export default function Toolbar() {
  const { fitView } = useReactFlow();
  const { validate, runBuild, abortBuild } = useJenkinsAPI();
  const [showHelp, setShowHelp] = useState(false);

  const buildStatus = useGraphStore(s => s.buildStatus);
  const isValidating = useGraphStore(s => s.isValidating);
  const validationErrors = useGraphStore(s => s.validationErrors);
  const isDirty = useGraphStore(s => s.isDirty);
  const toggleLogs = useGraphStore(s => s.toggleLogs);
  const autoLayout = useGraphStore(s => s.autoLayout);
  const showLogs = useGraphStore(s => s.showLogs);

  const errorCount = validationErrors.filter(e => e.severity === 'error').length;
  const warnCount = validationErrors.filter(e => e.severity === 'warning').length;

  const statusDot: Record<string, { color: string; label: string }> = {
    idle:    { color: 'transparent', label: '' },
    running: { color: 'var(--bo-blue-bright)', label: 'Running…' },
    success: { color: 'var(--bo-green)', label: 'Success' },
    failure: { color: 'var(--bo-red)', label: 'Failed' },
    aborted: { color: 'var(--bo-grey-light)', label: 'Aborted' },
  };

  const status = statusDot[buildStatus] ?? statusDot['idle'];

  return (
    <div className="bo-toolbar" style={{ position: 'relative' }}>
      {/* Left: pipeline brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 4 }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>🔵</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bo-blue)', letterSpacing: '0.04em' }}>
          PIPELINE EDITOR
        </span>
        {isDirty && (
          <span style={{ fontSize: 10, color: 'var(--bo-yellow)', background: 'rgba(232,168,0,0.15)', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>
            UNSAVED
          </span>
        )}
      </div>

      <div className="bo-divider" />

      {/* Canvas controls */}
      <button className="bo-toolbar-btn" onClick={autoLayout} title="Auto-layout nodes using dagre (L)">
        ⊞ Layout
      </button>
      <button className="bo-toolbar-btn" onClick={() => fitView({ padding: 0.2, duration: 300 })} title="Fit all nodes in view (F)">
        ⊡ Fit
      </button>

      <div className="bo-divider" />

      {/* Validation */}
      {errorCount > 0 && (
        <span style={{ fontSize: 11, color: 'var(--bo-red)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--bo-red)', display: 'inline-block' }} />
          {errorCount} error{errorCount > 1 ? 's' : ''}
        </span>
      )}
      {warnCount > 0 && (
        <span style={{ fontSize: 11, color: 'var(--bo-yellow)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--bo-yellow)', display: 'inline-block' }} />
          {warnCount} warning{warnCount > 1 ? 's' : ''}
        </span>
      )}

      <button
        className="bo-toolbar-btn"
        onClick={validate}
        disabled={isValidating}
        title="Validate Jenkinsfile syntax (Ctrl+Shift+V)"
        style={{ opacity: isValidating ? 0.6 : 1 }}
      >
        {isValidating ? '⟳ Validating…' : '✓ Validate'}
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Build status indicator */}
      {buildStatus !== 'idle' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}
          className={buildStatus === 'running' ? 'status-running' : `status-${buildStatus}`}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.color, display: 'inline-block', boxShadow: `0 0 5px ${status.color}` }} />
          {status.label}
        </div>
      )}

      {/* Run / Abort */}
      {buildStatus === 'running' ? (
        <button className="bo-toolbar-btn bo-toolbar-btn-danger" onClick={abortBuild} title="Abort running build">
          ■ Abort
        </button>
      ) : (
        <button className="bo-toolbar-btn bo-toolbar-btn-primary" onClick={() => runBuild()} title="Trigger Jenkins build (Ctrl+Shift+B)">
          ▶ Run Build
        </button>
      )}

      <div className="bo-divider" />

      {/* Logs toggle */}
      <button
        className="bo-toolbar-btn"
        onClick={toggleLogs}
        title="Toggle build log panel"
        style={{ borderColor: showLogs ? 'var(--bo-blue-dark)' : undefined, color: showLogs ? 'var(--bo-blue-bright)' : undefined }}
      >
        ☰ Logs
      </button>

      {/* Help */}
      <button
        className="bo-toolbar-btn"
        onClick={() => setShowHelp(h => !h)}
        title="Keyboard shortcuts & help"
        style={{ borderColor: showHelp ? 'var(--bo-blue-dark)' : undefined, color: showHelp ? 'var(--bo-blue-bright)' : undefined }}
      >
        ? Help
      </button>

      {/* Help tooltip panel */}
      {showHelp && (
        <div style={{
          position: 'absolute', top: 46, right: 0, zIndex: 1000,
          background: 'var(--bo-navy-light)', border: '1px solid var(--bo-navy-mid)',
          borderRadius: 8, padding: 16, width: 280,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          fontSize: 11, lineHeight: 2,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--bo-blue)', fontSize: 12 }}>Quick Reference</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ['Click node', 'Select & inspect'],
                ['Drag node', 'Reposition'],
                ['Drag palette item', 'Add node to canvas'],
                ['Drag handle → node', 'Connect nodes'],
                ['Delete / Backspace', 'Remove selected node'],
                ['Esc', 'Deselect'],
                ['Scroll', 'Zoom in/out'],
                ['Middle-click drag', 'Pan canvas'],
              ].map(([key, desc]) => (
                <tr key={key}>
                  <td style={{ paddingRight: 12, color: 'var(--bo-white-dim)' }}>
                    <span style={{ background: 'var(--bo-navy-mid)', borderRadius: 3, padding: '1px 5px', fontSize: 10, fontFamily: 'monospace' }}>
                      {key}
                    </span>
                  </td>
                  <td style={{ color: 'var(--bo-grey-light)' }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--bo-navy-mid)', color: 'var(--bo-grey)', fontSize: 10 }}>
            All changes sync to the Jenkinsfile automatically.
          </div>
        </div>
      )}
    </div>
  );
}


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
