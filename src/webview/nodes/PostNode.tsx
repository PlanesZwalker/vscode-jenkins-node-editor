// src/webview/nodes/PostNode.tsx
import React from 'react';
import { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

const CONDITION_COLORS: Record<string, string> = {
  always: '#5F5E5A', success: '#3B6D11', failure: '#A32D2D',
  unstable: '#854F0B', changed: '#185FA5', aborted: '#444441', cleanup: '#5F5E5A',
};

export default function PostNode(props: NodeProps) {
  const data = props.data as Record<string, unknown>;
  const condition = String(data['condition'] ?? 'always');
  const color = CONDITION_COLORS[condition] ?? '#5F5E5A';
  return (
    <BaseNode {...props} color={color} icon="◎">
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--je-fg)' }}>post</div>
      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2, color }}>{condition}</div>
    </BaseNode>
  );
}
