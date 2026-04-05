// src/webview/components/NodePalette.tsx
// Palette latérale — items draggables vers le canvas
// Voir docs/PHASE2.md §2.6

import React from 'react';
import { useGraphStore } from '../store/graphStore';

type PaletteItem = {
  nodeType: string;
  label: string;
  description: string;
  color: string;
};

const PALETTE_GROUPS: Array<{ title: string; items: PaletteItem[] }> = [
  {
    title: 'Structure',
    items: [
      { nodeType: 'agent',    label: 'Agent',    description: 'Defines where pipeline runs', color: '#1D9E75' },
      { nodeType: 'stage',    label: 'Stage',    description: 'A named phase in the pipeline', color: '#7F77DD' },
      { nodeType: 'parallel', label: 'Parallel', description: 'Run branches concurrently', color: '#BA7517' },
      { nodeType: 'post',     label: 'Post',     description: 'Post-execution conditions', color: '#D85A30' },
    ],
  },
  {
    title: 'Steps courants',
    items: [
      { nodeType: 'step-sh',               label: 'sh',               description: 'Shell script', color: '#185FA5' },
      { nodeType: 'step-echo',             label: 'echo',             description: 'Print message', color: '#185FA5' },
      { nodeType: 'step-git',              label: 'git',              description: 'Git checkout', color: '#3B6D11' },
      { nodeType: 'step-checkout',         label: 'checkout scm',     description: 'Checkout from SCM', color: '#3B6D11' },
      { nodeType: 'step-archiveArtifacts', label: 'archiveArtifacts', description: 'Archive build artifacts', color: '#185FA5' },
      { nodeType: 'step-junit',            label: 'junit',            description: 'Publish JUnit results', color: '#185FA5' },
      { nodeType: 'step-withCredentials',  label: 'withCredentials',  description: 'Inject credentials', color: '#993C1D' },
      { nodeType: 'step-timeout',          label: 'timeout',          description: 'Set build timeout', color: '#185FA5' },
      { nodeType: 'step-retry',            label: 'retry',            description: 'Retry on failure', color: '#185FA5' },
      { nodeType: 'step-script',           label: 'script',           description: 'Scripted Groovy block', color: '#444441' },
    ],
  },
  {
    title: 'Post-conditions',
    items: [
      { nodeType: 'post-always',   label: 'always',   description: 'Always runs', color: '#5F5E5A' },
      { nodeType: 'post-success',  label: 'success',  description: 'Runs on success', color: '#3B6D11' },
      { nodeType: 'post-failure',  label: 'failure',  description: 'Runs on failure', color: '#A32D2D' },
      { nodeType: 'post-unstable', label: 'unstable', description: 'Runs when unstable', color: '#854F0B' },
      { nodeType: 'post-changed',  label: 'changed',  description: 'Runs when result changes', color: '#185FA5' },
    ],
  },
];

function PaletteItemComponent({ item }: { item: PaletteItem }) {
  const onDragStart = (event: React.DragEvent) => {
    // Extraire le type de base (step-sh → step, post-always → post)
    const baseType = item.nodeType.startsWith('step-')
      ? 'step'
      : item.nodeType.startsWith('post-')
      ? 'post'
      : item.nodeType;

    // Données supplémentaires selon le type
    const extraData: Record<string, unknown> = { label: item.label };
    if (item.nodeType.startsWith('step-')) {
      extraData['stepType'] = item.nodeType.replace('step-', '');
      extraData['type'] = item.nodeType.replace('step-', '');
    }
    if (item.nodeType.startsWith('post-')) {
      extraData['condition'] = item.nodeType.replace('post-', '');
    }

    event.dataTransfer.setData('application/jenkins-node-type', baseType);
    event.dataTransfer.setData('application/jenkins-node-data', JSON.stringify(extraData));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      title={item.description}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        margin: '2px 0',
        borderRadius: 4,
        cursor: 'grab',
        userSelect: 'none',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--je-selected-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Badge coloré indiquant le type */}
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: item.color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 12, fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
        {item.label}
      </span>
    </div>
  );
}

export default function NodePalette() {
  const stepCatalog = useGraphStore(s => s.stepCatalog);

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--je-sidebar-bg)',
        borderRight: '1px solid var(--je-border)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '10px 12px 6px', fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Node Palette
      </div>

      {PALETTE_GROUPS.map(group => (
        <div key={group.title} style={{ marginBottom: 8 }}>
          <div style={{
            padding: '4px 12px',
            fontSize: 10,
            opacity: 0.5,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}>
            {group.title}
          </div>
          {group.items.map(item => (
            <PaletteItemComponent key={item.nodeType} item={item} />
          ))}
        </div>
      ))}

      {/* Steps depuis le catalogue Jenkins (si disponible) */}
      {stepCatalog.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ padding: '4px 12px', fontSize: 10, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Jenkins Steps ({stepCatalog.length})
          </div>
          {stepCatalog.slice(0, 20).map(step => (
            <div
              key={step.name}
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('application/jenkins-node-type', 'step');
                e.dataTransfer.setData('application/jenkins-node-data', JSON.stringify({ label: step.name, type: step.name }));
                e.dataTransfer.effectAllowed = 'move';
              }}
              title={step.description}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 10px', margin: '2px 0', borderRadius: 4,
                cursor: 'grab', userSelect: 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--je-selected-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#185FA5', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.9 }}>{step.displayName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
