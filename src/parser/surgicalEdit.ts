// src/parser/surgicalEdit.ts
// Minimal-diff edit computation for graph → document sync.
//
// WHY THIS EXISTS
// ---------------
// The graph is a *lossy* view of the Jenkinsfile: the parser understands the
// common declarative shapes but not every construct (arbitrary `script { }`
// bodies, multi-line step calls, comments, formatting). Regenerating the WHOLE
// file from the graph therefore destroys everything the parser didn't model —
// on a real 780-line Jenkinsfile that was a ~90% content loss (38 KB → 3.9 KB)
// and produced syntactically broken output.
//
// The fix: never rewrite the file. Regenerate the graph, diff it against the
// current text, and replace ONLY the smallest contiguous region that changed.
// Everything the user wrote outside that region stays byte-for-byte identical.
//
// SAFETY GUARD
// ------------
// If the computed region is enormous (a sign that generate() diverged from the
// source because the graph is lossy), we refuse the write instead of silently
// corrupting the file — see `isEditSafe`.

export type MinimalEdit = {
  /** Absolute char offset (inclusive) where the replacement starts. */
  start: number;
  /** Absolute char offset (exclusive) where the replacement ends. */
  end: number;
  /** Replacement text for [start, end). */
  newText: string;
  /** Characters removed (end - start). */
  removed: number;
  /** Characters inserted (newText.length). */
  added: number;
};

/**
 * Computes the smallest contiguous replacement that turns `oldText` into
 * `newText`: the longest common prefix and the longest common suffix are kept,
 * and only the differing middle is replaced. Returns null when the texts are
 * already identical.
 */
export function computeMinimalEdit(oldText: string, newText: string): MinimalEdit | null {
  if (oldText === newText) return null;

  const oldLen = oldText.length;
  const newLen = newText.length;
  const maxCommon = Math.min(oldLen, newLen);

  // Longest common prefix.
  let prefix = 0;
  while (prefix < maxCommon && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) prefix++;

  // Longest common suffix, not overlapping the prefix.
  let suffix = 0;
  while (
    suffix < maxCommon - prefix &&
    oldText.charCodeAt(oldLen - 1 - suffix) === newText.charCodeAt(newLen - 1 - suffix)
  ) suffix++;

  const start = prefix;
  const end = oldLen - suffix;
  const newText2 = newText.slice(prefix, newLen - suffix);

  return { start, end, newText: newText2, removed: end - start, added: newText2.length };
}

export type EditSafetyOptions = {
  /**
   * Maximum fraction of the original file the edit may remove before we consider
   * it a lossy full-regeneration rather than a user edit. Default 0.5 (50%).
   */
  maxRemovedFraction?: number;
  /**
   * Minimum file size (chars) below which the fraction guard is not applied
   * (small files legitimately change a lot). Default 400.
   */
  minFileSizeForGuard?: number;
};

export type EditSafety =
  | { safe: true }
  | { safe: false; reason: string };

/**
 * Decides whether a minimal edit is a plausible user edit (safe to apply) or a
 * lossy regeneration that would destroy content (unsafe — refuse).
 *
 * A genuine edit (rename a stage, change a step script, add/remove a step) is a
 * small contiguous change. A full regeneration of a lossy graph differs from the
 * source nearly everywhere, so its minimal edit removes most of the file.
 */
export function isEditSafe(
  edit: MinimalEdit,
  originalLength: number,
  options: EditSafetyOptions = {},
): EditSafety {
  const { maxRemovedFraction = 0.5, minFileSizeForGuard = 400 } = options;

  if (originalLength < minFileSizeForGuard) return { safe: true };

  if (edit.removed > maxRemovedFraction * originalLength) {
    const pct = Math.round((edit.removed / originalLength) * 100);
    return {
      safe: false,
      reason:
        `refusing to apply a destructive edit: it would remove ${pct}% of the ` +
        `Jenkinsfile (${edit.removed}/${originalLength} chars). This usually means ` +
        `the file contains constructs the visual model cannot represent, so a full ` +
        `regeneration would lose content. Edit the file directly in the text editor, ` +
        `or use the node editor on a simpler pipeline.`,
    };
  }
  return { safe: true };
}

/** Converts a char offset to a 0-based {line, character} position. */
export function offsetToPosition(text: string, offset: number): { line: number; character: number } {
  let line = 0;
  let lastNl = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* LF */) { line++; lastNl = i; }
  }
  return { line, character: offset - (lastNl + 1) };
}

// Char codes are used instead of string escapes so these literals survive any
// editor/tooling that rewrites backslash sequences.
const LF = String.fromCharCode(10);
const CRLF = String.fromCharCode(13) + String.fromCharCode(10);

/** True if the text uses CRLF line endings. */
export function usesCrlf(text: string): boolean {
  return text.includes(CRLF);
}

/** Converts every line ending in `text` to CRLF (useCrlf) or LF. */
export function normalizeEol(text: string, useCrlf: boolean): string {
  const lfOnly = text.split(CRLF).join(LF);
  return useCrlf ? lfOnly.split(LF).join(CRLF) : lfOnly;
}
