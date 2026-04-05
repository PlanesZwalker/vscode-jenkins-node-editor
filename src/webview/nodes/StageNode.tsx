// src/webview/nodes/StageNode.tsx
import React from 'react';
import { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export default function StageNode(props: NodeProps) {
  const data = props.data as Record<string, unknown>;
  const name = String(data['name'] ?? data['label'] ?? 'Stage');
  return (
    <BaseNode {...props} color="#7F77DD" icon="▶">
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--je-fg)' }}>{name}</div>
      {data['when'] && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>when: {String((data['when'] as Record<string,unknown>)?.['type'] ?? '')}</div>}
      {data['failFast'] && <div style={{ fontSize: 10, marginTop: 2, color: '#D85A30' }}>fail fast</div>}
    </BaseNode>
  );
}
