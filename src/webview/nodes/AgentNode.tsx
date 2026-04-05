// src/webview/nodes/AgentNode.tsx
import React from 'react';
import { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export default function AgentNode(props: NodeProps) {
  const data = props.data as Record<string, unknown>;
  const type = String(data['type'] ?? 'any');
  const detail = type === 'label' ? String(data['label'] ?? '')
    : type === 'docker' ? String(data['image'] ?? '')
    : type === 'dockerfile' ? String(data['filename'] ?? 'Dockerfile')
    : '';
  return (
    <BaseNode {...props} color="#1D9E75" icon="⬡">
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--je-fg)' }}>agent: {type}</div>
      {detail && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2, fontFamily: 'monospace' }}>{detail}</div>}
    </BaseNode>
  );
}
