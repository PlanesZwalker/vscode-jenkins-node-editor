// src/webview/nodes/PostNode.tsx
import React from 'react';
import { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

const CONDITION_COLORS: Record<string, string> = {
  always: '#8a9bb5', success: '#4caf7d', failure: '#e84040',
  unstable: '#e8a800', changed: '#1ba0d8', aborted: '#5a6882', cleanup: '#5a6882',
  fixed: '#4caf7d', regression: '#e84040',
};

export default function PostNode(props: NodeProps) {
  const data = props.data as Record<string, unknown>;
  const condition = String(data['condition'] ?? 'always');
  const color = CONDITION_COLORS[condition] ?? '#5F5E5A';
  return (
    <BaseNode {...props} color={color} icon="◎">
      <div className="bo-node-title">post</div>
      <div className="bo-node-subtitle" style={{ color }}>{condition}</div>
    </BaseNode>
  );
}
