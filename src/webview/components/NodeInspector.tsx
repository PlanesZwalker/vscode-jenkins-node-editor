// src/webview/components/NodeInspector.tsx
// Panneau d'inspection des propriétés du nœud sélectionné
// Voir docs/PHASE2.md §2.7

import React, { useCallback } from 'react';
import { useGraphStore } from '../store/graphStore';

function Field({
  label, value, onChange, type = 'text', options,
}: {
  label: string;
  value: string | number | boolean | undefined;
  onChange: (v: string | boolean) => void;
  type?: 'text' | 'textarea' | 'checkbox' | 'select' | 'number';
  options?: string[];
}) {
  const inputStyle = {
    background: 'var(--je-input-bg)',
    color: 'var(--je-input-fg)',
    border: '1px solid var(--je-input-border)',
    borderRadius: 3,
    padding: '4px 8px',
    fontSize: 12,
    fontFamily: type === 'textarea' ? 'var(--vscode-editor-font-family, monospace)' : 'inherit',
    width: '100%',
    resize: 'vertical' as const,
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', marginBottom: 4, fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {type === 'checkbox' ? (
        <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} />
      ) : type === 'textarea' ? (
        <textarea rows={4} value={String(value ?? '')} onChange={e => onChange(e.target.value)} style={inputStyle} />
      ) : type === 'select' && options ? (
        <select value={String(value ?? '')} onChange={e => onChange(e.target.value)} style={inputStyle}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} value={String(value ?? '')} onChange={e => onChange(e.target.value)} style={inputStyle} />
      )}
    </div>
  );
}

export default function NodeInspector() {
  const selectedNodeId = useGraphStore(s => s.selectedNodeId);
  const nodes = useGraphStore(s => s.nodes);
  const updateNodeData = useGraphStore(s => s.updateNodeData);
  const deleteNode = useGraphStore(s => s.deleteNode);
  const selectNode = useGraphStore(s => s.selectNode);

  const node = nodes.find(n => n.id === selectedNodeId);
  if (!node) return null;

  const data = node.data as Record<string, unknown>;
  const kind = node.type ?? 'step';

  const update = useCallback((key: string, value: unknown) => {
    updateNodeData(node.id, { [key]: value });
  }, [node.id, updateNodeData]);

  return (
    <div style={{
      width: 280,
      flexShrink: 0,
      background: 'var(--je-sidebar-bg)',
      borderLeft: '1px solid var(--je-border)',
      overflowY: 'auto',
      padding: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {kind}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => { deleteNode(node.id); }}
            style={{ background: 'var(--je-error)', padding: '2px 8px', fontSize: 11 }}
            title="Delete node"
          >
            Delete
          </button>
          <button onClick={() => selectNode(null)} style={{ background: 'transparent', border: '1px solid var(--je-border)', padding: '2px 8px', fontSize: 11 }}>
            ✕
          </button>
        </div>
      </div>

      {/* Champs selon le type de nœud */}

      {kind === 'stage' && <>
        <Field label="Name" value={String(data['name'] ?? data['label'] ?? '')} onChange={v => { update('name', v); update('label', v); }} />
        <Field label="Fail fast" value={Boolean(data['failFast'])} onChange={v => update('failFast', v)} type="checkbox" />
      </>}

      {kind === 'agent' && <>
        <Field label="Type" value={String(data['type'] ?? 'any')}
          onChange={v => update('type', v)} type="select"
          options={['any', 'none', 'label', 'docker', 'dockerfile']} />
        {data['type'] === 'label' && <Field label="Label" value={String(data['label'] ?? '')} onChange={v => update('label', v)} />}
        {data['type'] === 'docker' && <>
          <Field label="Image" value={String(data['image'] ?? '')} onChange={v => update('image', v)} />
          <Field label="Args" value={String(data['args'] ?? '')} onChange={v => update('args', v)} />
          <Field label="Reuse node" value={Boolean(data['reuseNode'])} onChange={v => update('reuseNode', v)} type="checkbox" />
        </>}
        {data['type'] === 'dockerfile' && <Field label="Filename" value={String(data['filename'] ?? 'Dockerfile')} onChange={v => update('filename', v)} />}
      </>}

      {kind === 'step' && <>
        <Field label="Type" value={String(data['type'] ?? 'sh')}
          onChange={v => { update('type', v); update('label', v); }} type="select"
          options={['sh', 'echo', 'git', 'checkout', 'archiveArtifacts', 'junit', 'withCredentials', 'timeout', 'retry', 'script', 'custom']} />
        {(data['type'] === 'sh' || data['type'] === 'script') && <>
          <Field label="Script" value={String(data['script'] ?? '')} onChange={v => update('script', v)} type="textarea" />
          <Field label="Return stdout" value={Boolean(data['returnStdout'])} onChange={v => update('returnStdout', v)} type="checkbox" />
        </>}
        {data['type'] === 'echo' && <Field label="Message" value={String(data['message'] ?? '')} onChange={v => { update('message', v); update('label', `echo: ${v}`); }} />}
        {data['type'] === 'git' && <>
          <Field label="URL" value={String(data['url'] ?? '')} onChange={v => update('url', v)} />
          <Field label="Branch" value={String(data['branch'] ?? 'main')} onChange={v => update('branch', v)} />
          <Field label="Credentials ID" value={String(data['credentialsId'] ?? '')} onChange={v => update('credentialsId', v)} />
        </>}
        {data['type'] === 'archiveArtifacts' && <Field label="Artifacts pattern" value={String(data['artifacts'] ?? '')} onChange={v => update('artifacts', v)} />}
        {data['type'] === 'junit' && <Field label="Test results pattern" value={String(data['pattern'] ?? '')} onChange={v => update('pattern', v)} />}
        {data['type'] === 'timeout' && <>
          <Field label="Time" value={Number(data['time'] ?? 5)} onChange={v => update('time', parseInt(String(v)))} type="number" />
          <Field label="Unit" value={String(data['unit'] ?? 'MINUTES')} onChange={v => update('unit', v)} type="select" options={['SECONDS', 'MINUTES', 'HOURS', 'DAYS']} />
        </>}
        {data['type'] === 'retry' && <Field label="Count" value={Number(data['count'] ?? 3)} onChange={v => update('count', parseInt(String(v)))} type="number" />}
        {data['type'] === 'custom' && <Field label="Raw content" value={String(data['rawContent'] ?? '')} onChange={v => update('rawContent', v)} type="textarea" />}
      </>}

      {kind === 'parallel' && <>
        <Field label="Fail fast" value={Boolean(data['failFast'])} onChange={v => update('failFast', v)} type="checkbox" />
      </>}

      {kind === 'post' && <>
        <Field label="Condition" value={String(data['condition'] ?? 'always')}
          onChange={v => { update('condition', v); update('label', `post: ${v}`); }} type="select"
          options={['always', 'success', 'failure', 'unstable', 'changed', 'aborted', 'cleanup']} />
      </>}

      {/* Erreurs de validation sur ce nœud */}
      {Array.isArray(data['validationErrors']) && (data['validationErrors'] as unknown[]).length > 0 && (
        <div style={{ marginTop: 16, padding: 8, background: 'rgba(228,75,74,0.1)', border: '1px solid var(--je-error)', borderRadius: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--je-error)', marginBottom: 4 }}>Validation errors</div>
          {(data['validationErrors'] as Array<{message: string}>).map((e, i) => (
            <div key={i} style={{ fontSize: 11, opacity: 0.9 }}>{e.message}</div>
          ))}
        </div>
      )}

      {/* ID du nœud (debug) */}
      <div style={{ marginTop: 16, opacity: 0.3, fontSize: 10 }}>ID: {node.id}</div>
    </div>
  );
}
