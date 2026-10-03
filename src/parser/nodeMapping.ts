// src/parser/nodeMapping.ts
// Pure helpers to attach validation errors to graph nodes.
// Kept free of any `vscode` import so it can be unit-tested.

import type { GraphModel, ValidationError } from '../shared/types';

/**
 * Best-effort mapping of a validation error to the node it belongs to, so the
 * webview can render an inline error marker. Jenkins' validate response and our
 * local checks give a line and/or a stage name, not a node id, so we infer it:
 *   1. a stage name quoted in the message, else
 *   2. the nearest stage at or above the error line (using sourceLine).
 */
export function inferNodeId(err: ValidationError, graph: GraphModel | null | undefined): string | undefined {
  if (!graph) return undefined;
  const stages = graph.nodes.filter(n => n.kind === 'stage');

  // 1. `stage('Name')` mentioned in the message.
  const m = err.message.match(/stage\s*\(\s*['"]([^'"]+)['"]/);
  if (m) {
    const s = stages.find(n => String((n.data as Record<string, unknown>)['name'] ?? '') === m[1]);
    if (s) return s.id;
  }

  // 2. Nearest stage whose source line is at or above the error line.
  if (typeof err.line === 'number' && err.line > 0) {
    let best: { id: string; line: number } | null = null;
    for (const s of stages) {
      const l = Number((s.data as Record<string, unknown>)['sourceLine'] ?? 0);
      if (l > 0 && l <= err.line && (!best || l > best.line)) best = { id: s.id, line: l };
    }
    if (best) return best.id;
  }
  return undefined;
}
