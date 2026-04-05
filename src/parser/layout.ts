// src/parser/layout.ts
// Auto-layout dagre pour les nœuds du graphe Jenkins
// Utilisé par le parser (positions initiales) ET la webview (bouton Auto-layout)

import dagre from 'dagre';
import type { JenkinsNode, JenkinsEdge } from '../shared/types';

// Dimensions par défaut des nœuds (en pixels)
const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  pipeline: { width: 220, height: 60 },
  agent: { width: 180, height: 56 },
  stage: { width: 200, height: 72 },
  step: { width: 180, height: 56 },
  parallel: { width: 160, height: 56 },
  post: { width: 180, height: 56 },
  environment: { width: 180, height: 56 },
  options: { width: 180, height: 56 },
  parameters: { width: 180, height: 56 },
  triggers: { width: 180, height: 56 },
  when: { width: 160, height: 44 },
};

const DEFAULT_DIMS = { width: 180, height: 56 };

export function applyDagreLayout(
  nodes: JenkinsNode[],
  edges: JenkinsEdge[],
  options: {
    direction?: 'TB' | 'LR' | 'BT' | 'RL';
    rankSep?: number;
    nodeSep?: number;
  } = {}
): JenkinsNode[] {
  const { direction = 'TB', rankSep = 80, nodeSep = 50 } = options;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: rankSep, nodesep: nodeSep });

  nodes.forEach(node => {
    const dims = NODE_DIMENSIONS[node.kind] ?? DEFAULT_DIMS;
    g.setNode(node.id, { width: dims.width, height: dims.height });
  });

  edges.forEach(edge => {
    // Pour dagre, on ignore les edges "contains" (parent→enfant) car ils briseraient le layout
    // On ne connecte que les edges de séquence et parallèle
    if (edge.type !== 'contains') {
      g.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(g);

  return nodes.map(node => {
    try {
      const { x, y } = g.node(node.id);
      const dims = NODE_DIMENSIONS[node.kind] ?? DEFAULT_DIMS;
      return {
        ...node,
        position: {
          x: x - dims.width / 2,
          y: y - dims.height / 2,
        },
      };
    } catch {
      // Si le nœud n'est pas dans le graphe dagre (nœud isolé), garder sa position
      return node;
    }
  });
}
