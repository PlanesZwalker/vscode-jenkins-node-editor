// src/webview/components/ConfigPanel.tsx
// Panneau de configuration Jenkins — s'ouvre automatiquement quand un build
// échoue faute de réglages, et via le bouton ⚙ de la barre d'outils.
// L'utilisateur édite ici ; l'extension persiste (token → SecretStorage).

import React, { useState, useEffect } from 'react';
import { useGraphStore } from '../store/graphStore';
import { postToExtension } from '../hooks/useVSCodeBridge';
import type { ConfigKey, JobParam } from '../../shared/types';

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
    key: 'jenkinsBranch',
    label: 'Branch (multibranch jobs)',
    placeholder: 'dev',
    hint: 'Optional. Appended to the job path for multibranch jobs (e.g. dev → …/job/dev).',
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
  const jobParams = useGraphStore(s => s.jobParams);
  const buildParams = useGraphStore(s => s.buildParams);
  const setBuildParam = useGraphStore(s => s.setBuildParam);
  const setConfigMissing = useGraphStore(s => s.setConfigMissing);
  const setBuildError = useGraphStore(s => s.setBuildError);
  const connectionSteps = useGraphStore(s => s.connectionSteps);
  const testingConnection = useGraphStore(s => s.testingConnection);
  const setConnectionSteps = useGraphStore(s => s.setConnectionSteps);
  const setTestingConnection = useGraphStore(s => s.setTestingConnection);

  // Local draft so the user can type without round-tripping on every keystroke.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (jenkinsConfig) {
      setDraft({
        jenkinsUrl: jenkinsConfig.jenkinsUrl,
        jenkinsUser: jenkinsConfig.jenkinsUser,
        jenkinsJobName: jenkinsConfig.jenkinsJobName,
        jenkinsBranch: jenkinsConfig.jenkinsBranch,
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

  // Test the connection using the current draft (unsaved values are sent as-is).
  const testConnection = () => {
    setConnectionSteps(null);
    setTestingConnection(true);
    postToExtension({
      type: 'TEST_CONNECTION',
      url: (draft.jenkinsUrl ?? '').trim() || undefined,
      user: (draft.jenkinsUser ?? '').trim() || undefined,
      jobName: (draft.jenkinsJobName ?? '').trim() || undefined,
      branch: (draft.jenkinsBranch ?? '').trim() || undefined,
      // Only send the token when the user typed one (else the stored one is used).
      token: (draft.jenkinsToken ?? '').trim() || undefined,
    });
  };

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

      {/* Test connection */}
      <div style={{ padding: '2px 14px 10px' }}>
        <button onClick={testConnection} disabled={testingConnection}
          style={{
            width: '100%', padding: '7px', borderRadius: 4, cursor: testingConnection ? 'default' : 'pointer',
            background: 'var(--bo-navy)', border: '1px solid var(--bo-blue)', color: 'var(--bo-blue-bright)',
            fontWeight: 600, fontSize: 11, opacity: testingConnection ? 0.6 : 1,
          }}>
          {testingConnection ? 'Testing…' : '🔌 Test connection'}
        </button>

        {connectionSteps && (
          <div style={{ marginTop: 8, fontSize: 11, lineHeight: 1.7 }}>
            {connectionSteps.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, color: s.ok ? 'var(--bo-green)' : 'var(--bo-red)' }}>
                <span>{s.ok ? '✓' : '✕'}</span>
                <span style={{ color: 'var(--bo-grey-light)' }}>
                  <strong style={{ color: s.ok ? 'var(--bo-green)' : 'var(--bo-red)' }}>{s.label}</strong>
                  <span style={{ opacity: 0.75 }}> — {s.detail}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Build parameters (from the Jenkinsfile's parameters {} block) */}
      {jobParams.length > 0 && (
        <div style={{ padding: '4px 14px 4px', borderTop: '1px solid var(--bo-navy-mid)' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--bo-grey)', margin: '10px 0 8px' }}>
            Build parameters
          </div>
          {jobParams.map(p => <ParamField key={p.name} param={p} value={buildParams[p.name] ?? p.defaultValue} onChange={v => setBuildParam(p.name, v)} />)}
        </div>
      )}

      <div style={{
        padding: '8px 14px 12px', borderTop: '1px solid var(--bo-navy-mid)',
        fontSize: 10, color: 'var(--bo-grey)', lineHeight: 1.6,
      }}>
        Settings are saved to your user settings (token → SecretStorage).
        All four are required to run a build.
        {jobParams.length > 0 && ' Parameters above are applied on Run Build.'}
      </div>
    </div>
  );
}

// ── Build-parameter field (text / boolean / choice) ──────────────────────────

function ParamField({ param, value, onChange }: { param: JobParam; value: string; onChange: (v: string) => void }) {
  const isBool = param.type === 'booleanParam';
  const label = (
    <label style={{ display: 'block', marginBottom: 3, fontSize: 10, color: 'var(--bo-grey-light)' }} title={param.description}>
      {param.name}
      <span style={{ opacity: 0.45, marginLeft: 6 }}>{param.type}</span>
    </label>
  );

  if (isBool) {
    return (
      <div style={{ marginBottom: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 11, color: 'var(--bo-grey-light)' }} title={param.description}>
          <input type="checkbox" checked={value === 'true'} onChange={e => onChange(e.target.checked ? 'true' : 'false')} />
          <span>{param.name} <span style={{ opacity: 0.45 }}>{param.type}</span></span>
        </label>
      </div>
    );
  }
  if (param.choices && param.choices.length > 0) {
    return (
      <div style={{ marginBottom: 10 }}>
        {label}
        <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
          {param.choices.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 10 }}>
      {label}
      <input type="text" value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}
