// src/webview/nodes/StepNode.tsx
import React from 'react';
import { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

const STEP_COLORS: Record<string, string> = {
  sh: '#185FA5', echo: '#378ADD', git: '#3B6D11', checkout: '#3B6D11',
  archiveArtifacts: '#185FA5', junit: '#185FA5', withCredentials: '#993C1D',
  timeout: '#BA7517', retry: '#BA7517', script: '#5F5E5A', custom: '#5F5E5A',
};

export default function StepNode(props: NodeProps) {
  const data = props.data as Record<string, unknown>;
  const type = String(data['type'] ?? 'sh');
  const color = STEP_COLORS[type] ?? '#185FA5';

  // Preview du contenu
  let preview = '';
  if (data['script']) preview = String(data['script']).split('\n')[0].slice(0, 35);
  else if (data['message']) preview = String(data['message']).slice(0, 35);
  else if (data['url']) preview = String(data['url']).slice(0, 35);
  else if (data['artifacts']) preview = String(data['artifacts']).slice(0, 35);
  if (preview.length === 35) preview += '…';

  return (
    <BaseNode {...props} color={color} icon="⚙">
      <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'monospace', color: 'var(--je-fg)' }}>{type}</div>
      {preview && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</div>}
    </BaseNode>
  );
}
