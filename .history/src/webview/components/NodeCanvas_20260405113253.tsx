// src/webview/components/NodeCanvas.tsx
// Canvas React Flow principal
// Voir docs/PHASE2.md §2.5

import React, { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from '../nodes';
import { useGraphStore } from '../store/graphStore';

// Dimensions par défaut des nouveaux nœuds droppés depuis la palette
const DEFAULT_NODE_DATA: Record<string, Record<string, unknown>> = {
  stage:    { label: 'New Stage', name: 'New Stage' },
  step:     { label: 'sh', type: 'sh', script: '' },
  agent:    { label: 'Agent', type: 'any' },
  parallel: { label: 'Parallel', branches: ['Branch A', 'Branch B'] },
  post:     { label: 'post: always', condition: 'always' },
};

let _dropCounter = 0;

export default function NodeCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const nodes = useGraphStore(s => s.nodes);
  const edges = useGraphStore(s => s.edges);
  const onNodesChange = useGraphStore(s => s.onNodesChange);
  const onEdgesChange = useGraphStore(s => s.onEdgesChange);
  const onConnect = useGraphStore(s => s.onConnect);
  const selectNode = useGraphStore(s => s.selectNode);
  const addNode = useGraphStore(s => s.addNode);

  // ── Drag & Drop depuis la palette ──────────────────────────────────────

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData('application/jenkins-node-type');
      if (!nodeType) return;

      // Convertir les coordonnées écran en coordonnées React Flow
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const id = `${nodeType}-drop-${++_dropCounter}`;
      const defaultData = DEFAULT_NODE_DATA[nodeType] ?? { label: nodeType };

      addNode({
        id,
        type: nodeType,
        position,
        data: { ...defaultData, kind: nodeType },
      });
    },
    [screenToFlowPosition, addNode]
  );

  // ── Raccourcis clavier ─────────────────────────────────────────────────

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    // Ctrl+A / Cmd+A → sélectionner tout (géré par React Flow nativement)
    // Escape → désélectionner
    if (event.key === 'Escape') {
      selectNode(null);
    }
  }, [selectNode]);

  return (
    <div
      ref={reactFlowWrapper}
      style={{ flex: 1, height: '100%', position: 'relative' }}
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => selectNode(node.id)}
        onPaneClick={() => selectNode(null)}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        panOnDrag={[1, 2]} // Bouton milieu ou droit pour pan
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="var(--je-border)"
        />
        <Controls
          showInteractive={false}
          style={{ bottom: 16, left: 16 }}
        />
        <MiniMap
          nodeStrokeWidth={3}
          nodeColor={n => {
            const colors: Record<string, string> = {
              stage: '#534AB7',
              step: '#185FA5',
              agent: '#0F6E56',
              parallel: '#854F0B',
              post: '#A32D2D',
              pipeline: '#3C3489',
            };
            return colors[n.type ?? ''] ?? '#5F5E5A';
          }}
          style={{ bottom: 16, right: 16 }}
        />
      </ReactFlow>

      {/* Welcome overlay when graph is empty */}
      {nodes.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            maxWidth: 380, textAlign: 'center', padding: 32,
            background: 'var(--je-sidebar-bg)', border: '1px solid var(--je-border)',
            borderRadius: 8, pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔧</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Jenkins Node Editor</div>
            <div style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.7, marginBottom: 16 }}>
              The Jenkinsfile is being parsed…<br />
              If nothing appears, the file may be empty or use an unsupported syntax.
            </div>
            <div style={{ fontSize: 11, opacity: 0.5, textAlign: 'left', background: 'var(--je-input-bg)', borderRadius: 4, padding: '10px 14px', lineHeight: 1.8 }}>
              <strong>Quick start:</strong><br />
              • <b>Drag</b> nodes from the left palette onto the canvas<br />
              • <b>Click</b> a node to edit its properties on the right<br />
              • <b>Connect</b> nodes by dragging from a handle<br />
              • <b>Delete</b> key removes a selected node<br />
              • Changes sync back to the Jenkinsfile automatically
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
