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
    <BaseNode {...props} color="#17d4db" icon="⬡">
      <div className="bo-node-title">agent: {type}</div>
      {detail && <div className="bo-node-subtitle" style={{ fontFamily: 'monospace' }}>{detail}</div>}
    </BaseNode>
  );
}
