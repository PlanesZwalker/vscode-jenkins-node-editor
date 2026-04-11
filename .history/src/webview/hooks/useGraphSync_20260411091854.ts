// src/webview/hooks/useGraphSync.ts
// Synchronisation debounced du graphe → extension host
// Voir docs/PHASE4.md §4.5

import { useEffect, useRef } from 'react';
import { useGraphStore } from '../store/graphStore';
import { postToExtension } from './useVSCodeBridge';
import type { GraphModel } from '../../shared/types';
import type { Node, Edge } from '@xyflow/react';

const DEFAULT_SYNC_DELAY = 300;

export function useGraphSync(syncDelay = DEFAULT_SYNC_DELAY): void {
  const nodes = useGraphStore(s => s.nodes);
  const edges = useGraphStore(s => s.edges);
  const isDirty = useGraphStore(s => s.isDirty);
  const markClean = useGraphStore(s => s.markClean);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Tracks whether any node is currently being dragged so we never
  // fire a sync mid-drag (which would cause DOC_CHANGED → setGraph → remount).
  const isDragging = nodes.some(n => (n as Node & { dragging?: boolean }).dragging);

  useEffect(() => {
    if (!isDirty || isDragging) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const graph = reactFlowToGraphModel(nodes, edges);
      postToExtension({ type: 'GRAPH_CHANGED', graph });
      markClean();
    }, syncDelay);

    return () => clearTimeout(timerRef.current);
  }, [nodes, edges, isDirty, isDragging, markClean, syncDelay]);
}

function reactFlowToGraphModel(nodes: Node[], edges: Edge[]): GraphModel {
  return {
    nodes: nodes.map(n => ({
      id: n.id,
      kind: (n.type ?? 'step') as GraphModel['nodes'][0]['kind'],
      label: String((n.data as Record<string, unknown>)['label'] ?? ''),
      data: n.data as Record<string, unknown>,
      position: n.position,
    })),
    edges: edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: (((e.data as Record<string, unknown>)?.['edgeType']) ?? 'sequence') as GraphModel['edges'][0]['type'],
      label: typeof e.label === 'string' ? e.label : undefined,
    })),
    meta: { declarative: true },
  };
}
