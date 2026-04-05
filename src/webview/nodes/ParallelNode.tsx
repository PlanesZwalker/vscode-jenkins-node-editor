// src/webview/nodes/ParallelNode.tsx
import React from 'react';
import { NodeProps, Handle, Position } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export default function ParallelNode(props: NodeProps) {
  const data = props.data as Record<string, unknown>;
  const branches = Array.isArray(data['branches']) ? data['branches'] as string[] : [];
  return (
    <BaseNode {...props} color="#BA7517" icon="⇶">
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--je-fg)' }}>parallel</div>
      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
        {branches.length > 0 ? `${branches.length} branches` : 'No branches'}
      </div>
      {data['failFast'] && <div style={{ fontSize: 10, color: '#D85A30', marginTop: 2 }}>fail fast</div>}
    </BaseNode>
  );
}
