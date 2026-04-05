// src/extension/PositionStore.ts
// Persistance des positions de nœuds dans .vscode/
// Voir docs/PHASE4.md §4.3

import * as vscode from 'vscode';
import * as path from 'path';
import type { GraphModel } from '../shared/types';

type NodePosition = { x: number; y: number };
type PositionMap = Record<string, NodePosition>;

export class PositionStore {
  private readonly storePath: string;

  constructor(documentUri: vscode.Uri) {
    // Clé unique basée sur le chemin du fichier (encodé en base64 pour le nom de fichier)
    const fileKey = Buffer.from(documentUri.fsPath)
      .toString('base64')
      .replace(/[/+=]/g, '_')
      .slice(0, 50); // limiter la longueur

    const dir = path.dirname(documentUri.fsPath);
    this.storePath = path.join(dir, '.vscode', `jenkins-positions-${fileKey}.json`);
  }

  async load(): Promise<PositionMap> {
    try {
      const uri = vscode.Uri.file(this.storePath);
      const content = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(Buffer.from(content).toString('utf8')) as PositionMap;
    } catch {
      return {}; // Fichier inexistant → positions vides (auto-layout sera appliqué)
    }
  }

  async save(positions: PositionMap): Promise<void> {
    try {
      const uri = vscode.Uri.file(this.storePath);
      const content = Buffer.from(JSON.stringify(positions, null, 2), 'utf8');
      await vscode.workspace.fs.writeFile(uri, content);
    } catch (err) {
      // Non critique : on ne bloque pas l'utilisateur si la sauvegarde échoue
      console.warn('[PositionStore] Failed to save positions:', err);
    }
  }
}

export function extractPositions(graph: GraphModel): PositionMap {
  return Object.fromEntries(graph.nodes.map(n => [n.id, n.position]));
}

export function mergePositions(graph: GraphModel, positions: PositionMap): GraphModel {
  return {
    ...graph,
    nodes: graph.nodes.map(n => ({
      ...n,
      position: positions[n.id] ?? n.position,
    })),
  };
}
