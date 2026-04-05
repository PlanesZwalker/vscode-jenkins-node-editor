// src/webview/nodes/StepNode.tsx
import React from 'react';
import { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

const STEP_COLORS: Record<string, string> = {
  sh: '#1ba0d8', bat: '#1ba0d8', echo: '#49bbf4', git: '#4caf7d', checkout: '#4caf7d',
  archiveArtifacts: '#1ba0d8', junit: '#1ba0d8', withCredentials: '#e86c00',
  timeout: '#e8a800', retry: '#e8a800', script: '#8a9bb5', custom: '#8a9bb5',
  input: '#6c63ff', sleep: '#5a6882', stash: '#5a6882', unstash: '#5a6882',
  slackSend: '#4caf7d', publishHTML: '#1ba0d8',
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
      <div className="bo-node-title" style={{ fontFamily: 'monospace' }}>{type}</div>
      {preview && <div className="bo-node-subtitle" style={{ fontFamily: 'monospace' }}>{preview}</div>}
    </BaseNode>
  );
}
