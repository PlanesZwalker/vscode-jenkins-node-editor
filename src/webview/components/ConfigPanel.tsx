// src/webview/components/ConfigPanel.tsx
// Panneau de configuration Jenkins — s'ouvre automatiquement quand un build
// échoue faute de réglages, et via le bouton ⚙ de la barre d'outils.
// L'utilisateur édite ici ; l'extension persiste (token → SecretStorage).

import React, { useState, useEffect } from 'react';
import { useGraphStore } from '../store/graphStore';
import { postToExtension } from '../hooks/useVSCodeBridge';
import type { ConfigKey } from '../../shared/types';

type FieldSpec = {
  key: ConfigKey;
  label: string;
  placeholder: string;
  hint: string;
  secret?: boolean;
};

const FIELDS: FieldSpec[] = [
  {
    key: 'jenkinsUrl',
    label: 'Jenkins URL',
    placeholder: 'https://jenkins.example.com',
    hint: 'Root URL of your Jenkins server (no trailing slash).',
  },
  {
    key: 'jenkinsUser',
    label: 'Jenkins user',
    placeholder: 'alice',
    hint: 'Username for API authentication.',
  },
  {
    key: 'jenkinsJobName',
    label: 'Job path',
    placeholder: 'my-folder/my-job',
    hint: 'Full job path used by “Run Build”. Folders are separated by “/”.',
  },
  {
    key: 'jenkinsToken',
    label: 'API token',
    placeholder: 'paste your Jenkins API token',
    hint: 'Stored in VS Code’s encrypted SecretStorage — never written to settings.json.',
    secret: true,
  },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--bo-navy)',
  color: 'var(--bo-white-dim)',
  border: '1px solid var(--bo-navy-mid)',
  borderRadius: 4,
  padding: '6px 9px',
  fontSize: 12,
  fontFamily: 'var(--vscode-editor-font-family, monospace)',
};

export default function ConfigPanel({ onClose }: { onClose?: () => void }) {
  const configMissing = useGraphStore(s => s.configMissing);
  const jenkinsConfig = useGraphStore(s => s.jenkinsConfig);
  const buildError = useGraphStore(s => s.buildError);
  const setConfigMissing = useGraphStore(s => s.setConfigMissing);
  const setBuildError = useGraphStore(s => s.setBuildError);

  // Local draft so the user can type without round-tripping on every keystroke.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (jenkinsConfig) {
      setDraft({
        jenkinsUrl: jenkinsConfig.jenkinsUrl,
        jenkinsUser: jenkinsConfig.jenkinsUser,
        jenkinsJobName: jenkinsConfig.jenkinsJobName,
        jenkinsToken: '', // never prefilled
      });
    }
  }, [jenkinsConfig]);

  const missingSet = new Set(configMissing);
  const save = (key: ConfigKey) => {
    const value = (draft[key] ?? '').trim();
    if (!value) return;
    postToExtension({ type: 'SET_CONFIG', key, value });
    if (key === 'jenkinsToken') setDraft(d => ({ ...d, jenkinsToken: '' }));
  };

  const close = () => { setConfigMissing([]); setBuildError(null); onClose?.(); };

  return (
    <div style={{
      position: 'absolute', top: 46, right: 12, zIndex: 2000, width: 420,
      background: 'var(--bo-navy-light)', border: '1px solid var(--bo-navy-mid)',
      borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
      color: 'var(--bo-white-dim)', fontSize: 12,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid var(--bo-navy-mid)',
      }}>
        <span style={{ fontWeight: 700, color: 'var(--bo-blue)', letterSpacing: '0.03em' }}>
          ⚙ JENKINS CONFIGURATION
        </span>
        <button onClick={close} title="Close"
          style={{ background: 'transparent', border: 'none', color: 'var(--bo-grey)', cursor: 'pointer', fontSize: 14 }}>
          ✕
        </button>
      </div>

      {/* Reason banner */}
      {buildError && (
        <div style={{
          margin: '10px 14px 0', padding: '8px 10px', borderRadius: 4,
          background: 'rgba(232,64,64,0.12)', border: '1px solid rgba(232,64,64,0.35)',
          color: 'var(--bo-red)', fontSize: 11, lineHeight: 1.5,
        }}>
          {buildError}
          {configMissing.length > 0 && (
            <div style={{ marginTop: 4, opacity: 0.85 }}>
              Missing: {configMissing.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Fields */}
      <div style={{ padding: '12px 14px 4px' }}>
        {FIELDS.map(f => {
          const isMissing = missingSet.has(f.key);
          const stored = f.key === 'jenkinsToken' && jenkinsConfig?.hasToken;
          return (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
                color: isMissing ? 'var(--bo-red)' : 'var(--bo-grey)',
              }}>
                {f.label}
                {isMissing && <span title="Required">●</span>}
                {stored && <span style={{ color: 'var(--bo-green)', textTransform: 'none' }}>· stored ✓</span>}
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type={f.secret && !showToken ? 'password' : 'text'}
                  value={draft[f.key] ?? ''}
                  placeholder={f.secret && stored ? '•••••••• (leave blank to keep)' : f.placeholder}
                  onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') save(f.key); }}
                  style={inputStyle}
                />
                {f.secret && (
                  <button onClick={() => setShowToken(v => !v)} title={showToken ? 'Hide' : 'Show'}
                    style={{ background: 'var(--bo-navy)', border: '1px solid var(--bo-navy-mid)', borderRadius: 4, color: 'var(--bo-grey-light)', cursor: 'pointer', padding: '0 8px' }}>
                    {showToken ? '🙈' : '👁'}
                  </button>
                )}
                <button onClick={() => save(f.key)} title={`Save ${f.label}`}
                  style={{
                    background: 'var(--bo-blue-dark)', border: '1px solid var(--bo-blue)', borderRadius: 4,
                    color: '#fff', cursor: 'pointer', padding: '0 12px', fontWeight: 600,
                  }}>
                  Save
                </button>
              </div>
              <div style={{ fontSize: 10, opacity: 0.5, marginTop: 3, fontStyle: 'italic' }}>{f.hint}</div>
            </div>
          );
        })}
      </div>

      <div style={{
        padding: '8px 14px 12px', borderTop: '1px solid var(--bo-navy-mid)',
        fontSize: 10, color: 'var(--bo-grey)', lineHeight: 1.6,
      }}>
        Settings are saved to your user settings (token → SecretStorage).
        All four are required to run a build.
      </div>
    </div>
  );
}
