// src/webview/utils/layout.ts
// Auto-layout with dagre for ReactFlow nodes (webview-side).
// The parser-side layout (src/parser/layout.ts) operates on JenkinsNode[].
// This version operates on ReactFlow Node[] / Edge[] for the autoLayout button.

import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 72;

export function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 50 });

  nodes.forEach(node => {
    const w = (node.measured?.width ?? node.width) ?? NODE_WIDTH;
    const h = (node.measured?.height ?? node.height) ?? NODE_HEIGHT;
    g.setNode(node.id, { width: w, height: h });
  });

  edges.forEach(edge => {
    // Include `contains` edges (parent→child): they keep steps/agent/post under
    // their owning stage instead of collapsing into a single top row.
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return nodes.map(node => {
    try {
      const { x, y } = g.node(node.id);
      const w = (node.measured?.width ?? node.width) ?? NODE_WIDTH;
      const h = (node.measured?.height ?? node.height) ?? NODE_HEIGHT;
      return {
        ...node,
        position: {
          x: x - w / 2,
          y: y - h / 2,
        },
      };
    } catch {
      return node;
    }
  });
}
