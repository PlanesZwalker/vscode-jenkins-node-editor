// src/parser/stepParser.ts
// Parsing d'une instruction de step Jenkins → données éditables du nœud.
//
// Deux régimes :
//   1. Steps « connus » (sh/echo/git/…) → champs structurés, éditables au formulaire.
//   2. Steps « bruts » (script{}, withCredentials([...]), checkout([...]), toute
//      invocation non reconnue) → on conserve le TEXTE SOURCE EXACT dans
//      `rawContent`. Le générateur le réémet tel quel → fidélité octet pour octet.
//
// Le module est pur (aucun import `vscode`) → testable sous Vitest.

/** Types de steps dont le contenu est conservé verbatim (non décomposé). */
const RAW_TYPES = new Set(['script', 'withCredentials', 'checkout', 'custom']);

/**
 * Vrai si ce step doit être réémis verbatim (aucune régénération).
 * `sh` fait exception : il n'est brut que lorsqu'il n'a PAS été décomposé
 * (ex. heredoc `sh '''…'''` multi-ligne). Un `sh 'x'` simple garde ses champs
 * structurés et reste éditable au formulaire.
 */
export function isRawStep(data: Record<string, unknown>): boolean {
  if (typeof data['rawContent'] !== 'string') return false;
  const t = String(data['type'] ?? '');
  if (t === 'sh') return typeof data['script'] !== 'string';
  return RAW_TYPES.has(t);
}

export type ParsedStep = Record<string, unknown>;

export function parseStep(line: string): ParsedStep | null {
  const t = line.trim();
  if (!t || t.startsWith('//') || t === '}' || t === '{') return null;

  // ── Steps connus, champs structurés ──────────────────────────────────────
  const shS = t.match(/^sh\s+(['"])(?!\1\1)([\s\S]*?)\1\s*$/);
  if (shS) return { type: 'sh', script: shS[2], rawContent: t };
  const shN = t.match(/^sh\s*\(\s*script:\s*(['"])(?!\1\1)([\s\S]*?)\1/);
  if (shN) {
    return { type: 'sh', script: shN[2], rawContent: t, returnStdout: /returnStdout\s*:\s*true/.test(t) };
  }
  // `sh '''…'''` / `sh """…"""` — heredoc, kept verbatim (never reformatted).
  if (/^sh\s+('''|""")/.test(t)) return { type: 'sh', rawContent: t };
  const echoM = t.match(/^echo\s+(['"])([\s\S]*?)\1\s*$/);
  if (echoM) return { type: 'echo', message: echoM[2], rawContent: t };
  const gitUrl = t.match(/^git\s+url:\s*['"]([^'"]+)['"]/);
  if (gitUrl) {
    const br = t.match(/branch:\s*['"]([^'"]+)['"]/);
    return { type: 'git', url: gitUrl[1], branch: br?.[1] ?? 'main', rawContent: t };
  }
  if (/^checkout\s+scm\b/.test(t)) return { type: 'checkout', url: 'scm', rawContent: t };
  const archN = t.match(/^archiveArtifacts\s+artifacts:\s*['"]([^'"]+)['"]/);
  if (archN) return { type: 'archiveArtifacts', artifacts: archN[1], rawContent: t };
  const archS = t.match(/^archiveArtifacts\s+['"]([^'"]+)['"]/);
  if (archS) return { type: 'archiveArtifacts', artifacts: archS[1], rawContent: t };
  const jS = t.match(/^junit\s+['"]([^'"]+)['"]/); if (jS) return { type: 'junit', pattern: jS[1], rawContent: t };
  const jN = t.match(/^junit\s+\w+:\s*['"]([^'"]+)['"]/); if (jN) return { type: 'junit', pattern: jN[1], rawContent: t };
  const toI = t.match(/^timeout\s*\(\s*time:\s*(\d+)(?:,\s*unit:\s*['"](\w+)['"])?/);
  if (toI) return { type: 'timeout', time: parseInt(toI[1]), unit: toI[2] ?? 'MINUTES', rawContent: t };
  const reI = t.match(/^retry\s*\(\s*(\d+)\s*\)/); if (reI) return { type: 'retry', count: parseInt(reI[1]), rawContent: t };

  // ── Steps bruts : on garde le source exact (fidélité) ────────────────────
  // `script { ... }` : bloc Groovy arbitraire.
  if (/^script\s*\{/.test(t)) return { type: 'script', rawContent: t };
  // `withCredentials([...]) { ... }` : décomposition non supportée.
  if (/^withCredentials\s*\(/.test(t)) return { type: 'withCredentials', rawContent: t };
  // `checkout([...])` : forme longue (non-SCM) → conservée telle quelle.
  if (/^checkout\s*\(/.test(t)) return { type: 'checkout', rawContent: t };
  // `sh(` multi-ligne (ex. heredoc `'''`) que la regex mono-ligne a manqué.
  if (/^sh\s*[({]/.test(t)) return { type: 'sh', rawContent: t };

  if (/^cleanWs\s*\(/.test(t)) return { type: 'custom', rawContent: t };

  // Toute autre invocation / commande Groovy → step brut préservé.
  const GKW = new Set(['if', 'else', 'for', 'while', 'def', 'return', 'throw', 'try', 'catch', 'finally', 'switch', 'case', 'import', 'class']);
  const gFn = t.match(/^(\w[\w.]*)\s*[({]/); if (gFn && !GKW.has(gFn[1])) return { type: 'custom', rawContent: t };
  const gStr = t.match(/^(\w[\w.]*)\s+['"].+/); if (gStr && !GKW.has(gStr[1])) return { type: 'custom', rawContent: t };
  return null;
}