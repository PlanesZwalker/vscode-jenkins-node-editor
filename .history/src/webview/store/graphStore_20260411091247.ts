// src/webview/store/graphStore.ts
// Store Zustand central — tout l'état mutable de l'application
// Voir docs/PHASE2.md §2.3

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { temporal } from 'zundo';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import type { Node, Edge, OnNodesChange, OnEdgesChange, Connection } from '@xyflow/react';
import type { GraphModel, ValidationError, BuildStatus } from '../../shared/types';
import { applyDagreLayout } from '../utils/layout';

// ─── Types du store ─────────────────────────────────────────────────────────

type GraphStore = {
  // ── State ────────────────────────────────────────────────────────────
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  showLogs: boolean;
  logs: string[];
  isDirty: boolean;
  isValidating: boolean;
  validationErrors: ValidationError[];
  buildStatus: BuildStatus;
  buildNumber: number | null;
  stepCatalog: Array<{ name: string; displayName: string; description: string }>;

  // ── Actions React Flow ───────────────────────────────────────────────
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;

  // ── Actions graphe ───────────────────────────────────────────────────
  setGraph: (model: GraphModel) => void;
  setNodes: (nodes: Node[]) => void;
  addNode: (node: Node) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  deleteNode: (id: string) => void;
  selectNode: (id: string | null) => void;
  autoLayout: () => void;
  markDirty: () => void;
  markClean: () => void;

  // ── Actions validation ───────────────────────────────────────────────
  setValidationErrors: (errors: ValidationError[]) => void;
  setIsValidating: (v: boolean) => void;

  // ── Actions build ────────────────────────────────────────────────────
  setBuildStatus: (status: BuildStatus) => void;
  setBuildNumber: (n: number | null) => void;

  // ── Actions logs ─────────────────────────────────────────────────────
  appendLog: (line: string) => void;
  clearLogs: () => void;
  toggleLogs: () => void;

  // ── Actions catalog ──────────────────────────────────────────────────
  setStepCatalog: (steps: GraphStore['stepCatalog']) => void;

  // ── Undo / redo ──────────────────────────────────────────────────────
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

// ─── Store ──────────────────────────────────────────────────────────────────

export const useGraphStore = create<GraphStore>()(
  immer((set, get) => ({
    // ── State initial ────────────────────────────────────────────────
    nodes: [],
    edges: [],
    selectedNodeId: null,
    showLogs: false,
    logs: [],
    isDirty: false,
    isValidating: false,
    validationErrors: [],
    buildStatus: 'idle',
    buildNumber: null,
    stepCatalog: [],

    // ── React Flow handlers ───────────────────────────────────────────
    onNodesChange: (changes) => set(state => {
      state.nodes = applyNodeChanges(changes, state.nodes) as Node[];
      // Marquer dirty seulement pour les changements de données (pas de position seule)
      const hasDirtyChange = changes.some(c =>
        c.type === 'remove' || (c.type === 'dimensions' && c.resizing)
      );
      if (hasDirtyChange) state.isDirty = true;
    }),

    onEdgesChange: (changes) => set(state => {
      state.edges = applyEdgeChanges(changes, state.edges) as Edge[];
      if (changes.some(c => c.type === 'remove')) state.isDirty = true;
    }),

    onConnect: (connection) => set(state => {
      state.edges = addEdge({ ...connection, type: 'smoothstep' }, state.edges) as Edge[];
      state.isDirty = true;
    }),

    // ── Actions graphe ────────────────────────────────────────────────
    setGraph: (model) => set(state => {
      // Convertir JenkinsNode → ReactFlow Node
      state.nodes = model.nodes.map(n => ({
        id: n.id,
        type: n.kind,
        position: n.position,
        data: { ...n.data, label: n.label, kind: n.kind },
      }));
      // Convertir JenkinsEdge → ReactFlow Edge
      state.edges = model.edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        data: { edgeType: e.type },
        label: e.label,
        animated: e.type === 'sequence',
      }));
      state.isDirty = false;
      state.validationErrors = [];
    }),

    setNodes: (nodes) => set(state => { state.nodes = nodes; }),

    addNode: (node) => set(state => {
      state.nodes.push(node);
      state.isDirty = true;
    }),

    updateNodeData: (id, data) => set(state => {
      const node = state.nodes.find(n => n.id === id);
      if (node) {
        node.data = { ...node.data, ...data };
        state.isDirty = true;
      }
    }),

    deleteNode: (id) => set(state => {
      state.nodes = state.nodes.filter(n => n.id !== id);
      state.edges = state.edges.filter(e => e.source !== id && e.target !== id);
      if (state.selectedNodeId === id) state.selectedNodeId = null;
      state.isDirty = true;
    }),

    selectNode: (id) => set(state => { state.selectedNodeId = id; }),

    autoLayout: () => set(state => {
      state.nodes = applyDagreLayout(state.nodes as Node[], state.edges as Edge[]) as Node[];
    }),

    markDirty: () => set(state => { state.isDirty = true; }),
    markClean: () => set(state => { state.isDirty = false; }),

    // ── Validation ────────────────────────────────────────────────────
    setValidationErrors: (errors) => set(state => {
      state.validationErrors = errors;
      state.isValidating = false;
      // Associer les erreurs aux nœuds concernés
      state.nodes = state.nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          validationErrors: errors.filter(e =>
            e.nodeId === node.id
          ),
        },
      }));
    }),

    setIsValidating: (v) => set(state => { state.isValidating = v; }),

    // ── Build ─────────────────────────────────────────────────────────
    setBuildStatus: (status) => set(state => { state.buildStatus = status; }),
    setBuildNumber: (n) => set(state => { state.buildNumber = n; }),

    // ── Logs ──────────────────────────────────────────────────────────
    appendLog: (line) => set(state => {
      state.logs.push(line);
      // Limiter à 5000 lignes pour éviter les fuites mémoire
      if (state.logs.length > 5000) state.logs = state.logs.slice(-4000);
      if (!state.showLogs) state.showLogs = true; // Ouvrir auto
    }),

    clearLogs: () => set(state => { state.logs = []; }),
    toggleLogs: () => set(state => { state.showLogs = !state.showLogs; }),

    // ── Catalog ───────────────────────────────────────────────────────
    setStepCatalog: (steps) => set(state => { state.stepCatalog = steps; }),
  }))
);
