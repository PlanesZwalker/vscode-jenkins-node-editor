// src/webview/nodes/StageNode.tsx
import React from 'react';
import { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export default function StageNode(props: NodeProps) {
  const data = props.data as Record<string, unknown>;
  const name = String(data['name'] ?? data['label'] ?? 'Stage');
  // when condition label
  const whenType = data['whenType'] ? String(data['whenType']) : (data['when'] as Record<string,unknown>)?.['type'] ? String((data['when'] as Record<string,unknown>)['type']) : null;
  return (
    <BaseNode {...props} color="#6c63ff" icon="▶">
      <div className="bo-node-title">{name}</div>
      {whenType && <div className="bo-node-subtitle">⚑ when: {whenType}</div>}
      {data['agentType'] && <div className="bo-node-subtitle">⬡ {String(data['agentType'])}</div>}
      {data['failFast'] && <div style={{ fontSize: 10, marginTop: 3, color: 'var(--bo-orange)', fontWeight: 600 }}>⚡ fail fast</div>}
    </BaseNode>
  );
}
