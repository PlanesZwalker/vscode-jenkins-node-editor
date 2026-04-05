// src/webview/nodes/ParallelNode.tsx
import React from 'react';
import { NodeProps, Handle, Position } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export default function ParallelNode(props: NodeProps) {
  const data = props.data as Record<string, unknown>;
  const branches = Array.isArray(data['branches']) ? data['branches'] as string[] : [];
  return (
    <BaseNode {...props} color="#e8a800" icon="⇶">
      <div className="bo-node-title">parallel</div>
      <div className="bo-node-subtitle">{branches.length > 0 ? `${branches.length} branches` : 'No branches'}</div>
      {data['failFast'] && <div style={{ fontSize: 10, color: 'var(--bo-orange)', marginTop: 3, fontWeight: 600 }}>⚡ fail fast</div>}
    </BaseNode>
  );
}
