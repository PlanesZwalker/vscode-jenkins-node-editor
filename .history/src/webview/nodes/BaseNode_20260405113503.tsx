// src/webview/nodes/BaseNode.tsx
// Blue Ocean inspired node card

import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

type BaseNodeProps = NodeProps & {
  color: string;
  icon?: string;
  statusColor?: string; // running=blue, success=green, failure=red
  children?: React.ReactNode;
};

export function BaseNode({ data, selected, color, icon, statusColor, children }: BaseNodeProps) {
  const nodeData = data as Record<string, unknown>;
  const hasErrors = Array.isArray(nodeData['validationErrors']) && (nodeData['validationErrors'] as unknown[]).length > 0;
  const kind = String(nodeData['kind'] ?? 'node');

  const borderColor = selected
    ? 'var(--bo-blue)'
    : hasErrors
    ? 'var(--bo-red)'
    : `${color}55`;

  const shadow = selected
    ? `0 0 0 2px var(--bo-blue), 0 4px 20px rgba(27,160,216,0.2)`
    : '0 2px 10px rgba(0,0,0,0.35)';

  return (
    <div
      className="bo-node"
      style={{
        borderColor,
        boxShadow: shadow,
        borderTop: `2.5px solid ${color}`,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: color, borderColor: 'var(--bo-navy)', width: 10, height: 10, top: -6 }}
      />

      {/* Header */}
      <div
        className="bo-node-header"
        style={{ background: `${color}14` }}
      >
        {statusColor && (
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: statusColor, flexShrink: 0,
            boxShadow: `0 0 4px ${statusColor}`,
          }} />
        )}
        {icon && <span style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>}
        <span
          className="bo-node-type-badge"
          style={{ background: `${color}22`, color }}
        >
          {kind}
        </span>
        {hasErrors && (
          <span style={{ marginLeft: 'auto', color: 'var(--bo-red)', fontSize: 12, lineHeight: 1 }}>⚠</span>
        )}
      </div>

      {/* Body */}
      <div className="bo-node-body">
        {children}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: color, borderColor: 'var(--bo-navy)', width: 10, height: 10, bottom: -6 }}
      />
    </div>
  );
}


import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

type BaseNodeProps = NodeProps & {
  color: string;
  icon?: string;
  children?: React.ReactNode;
};

export function BaseNode({ data, selected, color, icon, children }: BaseNodeProps) {
  const nodeData = data as Record<string, unknown>;
  const hasErrors = Array.isArray(nodeData['validationErrors']) && (nodeData['validationErrors'] as unknown[]).length > 0;

  return (
    <div
      style={{
        background: 'var(--je-sidebar-bg)',
        border: `1.5px solid ${selected ? 'var(--je-accent)' : hasErrors ? 'var(--je-error)' : 'var(--je-border)'}`,
        borderRadius: 6,
        minWidth: 160,
        maxWidth: 240,
        boxShadow: selected ? `0 0 0 2px var(--je-accent)33` : 'none',
        transition: 'border-color 0.1s, box-shadow 0.1s',
      }}
    >
      {/* Handle target (entrée) */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: color, borderColor: 'var(--je-bg)', width: 10, height: 10 }}
      />

      {/* Header coloré */}
      <div style={{
        background: color + '22',
        borderBottom: `1px solid ${color}44`,
        padding: '5px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: '5px 5px 0 0',
      }}>
        {icon && <span style={{ fontSize: 12 }}>{icon}</span>}
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}>
          {String(nodeData['kind'] ?? 'node')}
        </span>
        {hasErrors && <span style={{ marginLeft: 'auto', color: 'var(--je-error)', fontSize: 12 }}>⚠</span>}
      </div>

      {/* Corps du nœud */}
      <div style={{ padding: '6px 10px' }}>
        {children}
      </div>

      {/* Handle source (sortie) */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: color, borderColor: 'var(--je-bg)', width: 10, height: 10 }}
      />
    </div>
  );
}
