import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  computeMinimalEdit, isEditSafe, offsetToPosition, normalizeEol, usesCrlf,
} from '../../src/parser/surgicalEdit';
import { JenkinsfileParser } from '../../src/parser/JenkinsfileParser';
import { JenkinsfileGenerator } from '../../src/parser/JenkinsfileGenerator';

const load = (n: string) => fs.readFileSync(path.join(__dirname, '../fixtures', n), 'utf8');
/** Mirrors what JenkinsNodeEditor.applyGraphToDocument does before diffing. */
const regenerateLikeExtension = async (src: string, mutate?: (g: any) => void) => {
  const { graph } = await new JenkinsfileParser().parse(src);
  if (mutate) mutate(graph);
  const out = new JenkinsfileGenerator().generate(graph);
  return normalizeEol(out, usesCrlf(src));
};

describe('computeMinimalEdit', () => {
  it('returns null when texts are identical', () => {
    expect(computeMinimalEdit('same', 'same')).toBeNull();
  });
  it('replaces only the differing middle', () => {
    const e = computeMinimalEdit('abcXYZdef', 'abcPQRdef')!;
    expect(e).toMatchObject({ start: 3, end: 6, newText: 'PQR', removed: 3, added: 3 });
  });
  it('handles pure append (empty removed region)', () => {
    expect(computeMinimalEdit('abc', 'abcdef')!).toMatchObject({ start: 3, end: 3, newText: 'def', removed: 0, added: 3 });
  });
  it('handles pure deletion', () => {
    expect(computeMinimalEdit('abcdef', 'abc')!).toMatchObject({ start: 3, end: 6, newText: '', removed: 3, added: 0 });
  });
  it('preserves long unchanged prefix/suffix (surgical rename)', () => {
    const old = 'pipeline {\n  stages {\n    stage("Build") {\n      steps { sh "make" }\n    }\n  }\n}\n';
    const e = computeMinimalEdit(old, old.replace('Build', 'Compile'))!;
    expect(e.newText).toBe('Compile');
    expect(old.slice(0, e.start) + e.newText + old.slice(e.end)).toBe(old.replace('Build', 'Compile'));
  });
});

describe('normalizeEol / usesCrlf', () => {
  const LF = String.fromCharCode(10), CR = String.fromCharCode(13);
  it('detects CRLF', () => {
    expect(usesCrlf('a' + CR + LF + 'b')).toBe(true);
    expect(usesCrlf('a' + LF + 'b')).toBe(false);
  });
  it('converts LF -> CRLF and back', () => {
    expect(normalizeEol('a' + LF + 'b', true)).toBe('a' + CR + LF + 'b');
    expect(normalizeEol('a' + CR + LF + 'b', false)).toBe('a' + LF + 'b');
  });
});

describe('isEditSafe — the lossy-regeneration guard', () => {
  it('allows a small edit on a large file', () => {
    expect(isEditSafe({ start: 10, end: 15, newText: 'x', removed: 5, added: 1 }, 10000).safe).toBe(true);
  });
  it('refuses a destructive regeneration on a large file', () => {
    const r = isEditSafe({ start: 0, end: 8000, newText: 'tiny', removed: 8000, added: 4 }, 10000);
    expect(r.safe).toBe(false);
    if (!r.safe) expect(r.reason).toMatch(/remove \d+%/);
  });
  it('does not guard tiny files', () => {
    expect(isEditSafe({ start: 0, end: 100, newText: 'x', removed: 100, added: 1 }, 120).safe).toBe(true);
  });
});

describe('end-to-end: faithful files get a surgical edit, lossy files are refused', () => {
  it('simple.Jenkinsfile: rename a stage → tiny edit, safe', async () => {
    const src = load('simple.Jenkinsfile');
    const regen = await regenerateLikeExtension(src, g => {
      const s = g.nodes.find((n: any) => n.kind === 'stage' && n.data.name === 'Test');
      s.data.name = 'Test Suite'; s.data.label = 'Test Suite';
    });
    const edit = computeMinimalEdit(src, regen)!;
    expect(edit).not.toBeNull();
    expect(edit.removed).toBeLessThan(60);                       // only the stage name region
    expect(isEditSafe(edit, src.length).safe).toBe(true);
    // exact reconstruction
    expect(src.slice(0, edit.start) + edit.newText + src.slice(edit.end)).toBe(regen);
  });

  it('simple.Jenkinsfile: no-op regeneration produces NO edit (idempotent)', async () => {
    const src = load('simple.Jenkinsfile');
    const regen = await regenerateLikeExtension(src);
    expect(computeMinimalEdit(src, regen)).toBeNull();
  });

  it('REAL Jenkinsfile: lossy regeneration is BLOCKED by the guard', async () => {
    const src = fs.readFileSync('C:/Users/anne/Desktop/GLSL_DISCORD/Jenkinsfile', 'utf8');
    const regen = await regenerateLikeExtension(src);
    const edit = computeMinimalEdit(src, regen);
    expect(edit).not.toBeNull();
    expect(isEditSafe(edit!, src.length).safe).toBe(false);
  });
});

describe('offsetToPosition', () => {
  it('maps offsets to 0-based line/character', () => {
    const t = 'ab\ncde\nf';           // offsets: 0..2 line0, 3..7 line1, 8 line2
    expect(offsetToPosition(t, 0)).toEqual({ line: 0, character: 0 });
    expect(offsetToPosition(t, 4)).toEqual({ line: 1, character: 1 });
    expect(offsetToPosition(t, 7)).toEqual({ line: 2, character: 0 }); // char after 2nd \n
  });
});
