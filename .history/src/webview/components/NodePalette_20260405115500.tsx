// src/webview/components/NodePalette.tsx
// Blue Ocean inspired node palette

import React, { useState } from 'react';
import { useGraphStore } from '../store/graphStore';

type PaletteItem = {
  nodeType: string;
  label: string;
  description: string;
  color: string;
  icon: string;
};

const PALETTE_GROUPS: Array<{ title: string; items: PaletteItem[] }> = [
  {
    title: 'Pipeline structure',
    items: [
      { nodeType: 'agent',    label: 'Agent',    icon: '⬡', description: 'Defines where the pipeline runs', color: '#17d4db' },
      { nodeType: 'stage',    label: 'Stage',    icon: '▶', description: 'A named phase in the pipeline', color: '#6c63ff' },
      { nodeType: 'parallel', label: 'Parallel', icon: '⇶', description: 'Run stage branches concurrently', color: '#e8a800' },
      { nodeType: 'post',     label: 'Post',     icon: '◎', description: 'Post-execution conditions', color: '#e84040' },
    ],
  },
  {
    title: 'Shell & scripts',
    items: [
      { nodeType: 'step-sh',     label: 'sh',     icon: '$', description: 'Run a shell command', color: '#1ba0d8' },
      { nodeType: 'step-bat',    label: 'bat',    icon: '>', description: 'Run a Windows batch command', color: '#1ba0d8' },
      { nodeType: 'step-echo',   label: 'echo',   icon: '»', description: 'Print a message to the log', color: '#49bbf4' },
      { nodeType: 'step-script', label: 'script', icon: '{}', description: 'Scripted Groovy block', color: '#8a9bb5' },
    ],
  },
  {
    title: 'Source control',
    items: [
      { nodeType: 'step-checkout', label: 'checkout scm', icon: '⎇', description: 'Checkout from configured SCM', color: '#4caf7d' },
      { nodeType: 'step-git',      label: 'git',          icon: '⎇', description: 'Git checkout with URL/branch', color: '#4caf7d' },
    ],
  },
  {
    title: 'Artifacts & tests',
    items: [
      { nodeType: 'step-archiveArtifacts', label: 'archiveArtifacts', icon: '📦', description: 'Archive build artifacts', color: '#1ba0d8' },
      { nodeType: 'step-junit',            label: 'junit',            icon: '✓',  description: 'Publish JUnit test results', color: '#4caf7d' },
      { nodeType: 'step-stash',            label: 'stash',            icon: '⬆',  description: 'Stash files for later use', color: '#5a6882' },
      { nodeType: 'step-unstash',          label: 'unstash',          icon: '⬇',  description: 'Restore stashed files', color: '#5a6882' },
    ],
  },
  {
    title: 'Flow control',
    items: [
      { nodeType: 'step-timeout',          label: 'timeout',         icon: '⏱', description: 'Fail if step takes too long', color: '#e8a800' },
      { nodeType: 'step-retry',            label: 'retry',           icon: '↺',  description: 'Retry on failure', color: '#e8a800' },
      { nodeType: 'step-input',            label: 'input',           icon: '?',  description: 'Pause for human approval', color: '#6c63ff' },
      { nodeType: 'step-sleep',            label: 'sleep',           icon: '⏸', description: 'Pause execution for a duration', color: '#5a6882' },
    ],
  },
  {
    title: 'Security',
    items: [
      { nodeType: 'step-withCredentials', label: 'withCredentials', icon: '🔑', description: 'Inject credentials as env vars', color: '#e86c00' },
    ],
  },
  {
    title: 'Notifications',
    items: [
      { nodeType: 'step-slackSend',  label: 'slackSend',  icon: '💬', description: 'Send a Slack message', color: '#4caf7d' },
      { nodeType: 'step-custom',     label: 'custom step', icon: '⚙', description: 'Any raw Groovy step', color: '#8a9bb5' },
    ],
  },
];

function PaletteItemComponent({ item }: { item: PaletteItem }) {
  const onDragStart = (event: React.DragEvent) => {
    const baseType = item.nodeType.startsWith('step-') ? 'step'
      : item.nodeType.startsWith('post-') ? 'post'
      : item.nodeType;

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
      className="bo-palette-item"
      style={{ borderLeftColor: 'transparent' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderLeftColor = item.color; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderLeftColor = 'transparent'; }}
    >
      <span style={{ width: 20, textAlign: 'center', fontSize: 13, flexShrink: 0, color: item.color }}>
        {item.icon}
      </span>
      <div>
        <div className="bo-palette-label">{item.label}</div>
        <div className="bo-palette-desc">{item.description}</div>
      </div>
    </div>
  );
}

function GroupSection({ title, items }: { title: string; items: PaletteItem[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="bo-sidebar-section-title"
        style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--bo-grey)', padding: '8px 12px 4px' }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 9 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && items.map(item => <PaletteItemComponent key={item.nodeType} item={item} />)}
    </div>
  );
}

export default function NodePalette() {
  const stepCatalog = useGraphStore(s => s.stepCatalog);

  return (
    <div className="bo-sidebar">
      {/* Header */}
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--bo-navy-mid)', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bo-blue)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Node Palette
        </div>
        <div style={{ fontSize: 10, color: 'var(--bo-grey)', marginTop: 2 }}>
          Drag items onto the canvas
        </div>
      </div>

      {/* Groups */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {PALETTE_GROUPS.map(group => (
          <GroupSection key={group.title} title={group.title} items={group.items} />
        ))}

        {/* Steps from Jenkins catalog */}
        {stepCatalog.length > 0 && (
          <GroupSection
            title={`Jenkins steps (${stepCatalog.length})`}
            items={stepCatalog.slice(0, 30).map(s => ({
              nodeType: `step-${s.name}`,
              label: s.name,
              icon: '⚙',
              description: s.description ?? '',
              color: '#1ba0d8',
            }))}
          />
        )}
      </div>
    </div>
  );
}

