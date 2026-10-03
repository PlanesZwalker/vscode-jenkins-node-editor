// src/parser/JenkinsfileParser.ts
// Jenkinsfile -> GraphModel (declarative & basic scripted)

import type {
  GraphModel, JenkinsNode, JenkinsEdge, NodeKind, EnvironmentData,
} from '../shared/types';
import { applyDagreLayout } from './layout';
import { parseStep } from './stepParser';

type ParseError = { line: number; column: number; message: string; severity: 'error' | 'warning'; };
type ParseResult = { graph: GraphModel; errors: ParseError[]; mode: 'declarative' | 'scripted'; };
type Block = { keyword: string; args: string; body: string; fullBody?: string; startLine: number; endLine: number; children: Block[]; rawText?: string; };

let _nodeCounter = 0;
function nextId(prefix: string): string { return `${prefix}-${++_nodeCounter}`; }

// ─── Main class ──────────────────────────────────────────────────────────────

export class JenkinsfileParser {
  async parse(source: string, options: { autoLayout?: boolean } = {}): Promise<ParseResult> {
    _nodeCounter = 0;
    const autoLayout = options.autoLayout !== false;
    const errors: ParseError[] = [];
    const mode = detectMode(source);
    if (!source.trim()) {
      errors.push({ line: 1, column: 0, message: 'Empty Jenkinsfile', severity: 'error' });
      return { graph: { nodes: [], edges: [], meta: { declarative: false } }, errors, mode };
    }
    const depth = countBraceDepth(source);
    if (depth !== 0) {
      errors.push({
        line: 0, column: 0,
        message: `Unbalanced braces: ${depth > 0 ? depth + ' block(s) not closed' : 'unexpected closing brace'}`,
        severity: 'error',
      });
    }
    try {
      let graph: GraphModel;
      if (mode === 'declarative') { graph = parseDeclarative(source, errors); }
      else { graph = parseScripted(source, errors); }
      if (autoLayout) {
        const hasPositions = graph.nodes.some(n => n.position.x !== 0 || n.position.y !== 0);
        if (!hasPositions && graph.nodes.length > 0) {
          graph = { ...graph, nodes: applyDagreLayout(graph.nodes, graph.edges) };
        }
      }
      return { graph, errors, mode };
    } catch (err) {
      errors.push({ line: 0, column: 0, message: `Parse failed: ${err instanceof Error ? err.message : String(err)}`, severity: 'error' });
      return { graph: { nodes: [], edges: [], meta: { declarative: mode === 'declarative' } }, errors, mode };
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countBraceDepth(source: string): number {
  let depth = 0; let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '/' && source[i+1] === '/') { while (i < source.length && source[i] !== '\n') i++; }
    else if (ch === '/' && source[i+1] === '*') {
      i += 2;
      while (i < source.length - 1 && !(source[i] === '*' && source[i+1] === '/')) i++;
      i++;
    } else if (ch === "'" || ch === '"') {
      const triple = source.slice(i, i+3);
      if (triple === "'''" || triple === '"""') {
        i += 3; while (i <= source.length - 3 && source.slice(i, i+3) !== triple) i++; i += 2;
      } else {
        const q = ch; i++;
        while (i < source.length && source[i] !== q && source[i] !== '\n') { if (source[i] === '\\') i++; i++; }
      }
    } else if (ch === '{') { depth++; } else if (ch === '}') { depth--; }
    i++;
  }
  return depth;
}

export function detectMode(source: string): 'declarative' | 'scripted' {
  // A declarative pipeline may be preceded by comments, `@Library` annotations,
  // and top-level Groovy constants (`IMAGE_MAP = [...]`, `SCALE_SVCS = [...]`).
  // The old start-anchored regex (`/^\s*pipeline\s*\{/`) missed every one of
  // those, mis-classifying such files as 'scripted' → empty graph, no stages.
  // Tokenize (comment/string aware) and look for a top-level `pipeline {` block.
  try {
    if (tokenizeBlocks(source).some(b => b.keyword === 'pipeline')) return 'declarative';
  } catch { /* fall through to regex */ }
  // Fallback: a `pipeline {` at the start of any line (not just the first).
  return /(?:^|\n)\s*pipeline\s*\{/.test(source) ? 'declarative' : 'scripted';
}

export function tokenizeBlocks(source: string): Block[] {
  const roots: Block[] = [];
  const stack: Array<{ block: Block; bodyStart: number; origBodyStart: number; textStart: number }> = [];
  let line = 1; let i = 0;

  function skipString(start: number): number {
    let j = start;
    const triple = source.slice(j, j+3);
    if (triple === "'''" || triple === '"""') {
      j += 3;
      while (j <= source.length - 3) { if (source[j] === '\n') line++; if (source.slice(j, j+3) === triple) return j+3; j++; }
      return j;
    }
    const q = source[j]; j++;
    while (j < source.length && source[j] !== q && source[j] !== '\n') { if (source[j] === '\\') j++; j++; }
    return j < source.length ? j+1 : j;
  }

  while (i < source.length) {
    const ch = source[i];
    if (ch === '/' && source[i+1] === '/') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (ch === '/' && source[i+1] === '*') {
      i += 2;
      while (i < source.length - 1) { if (source[i] === '\n') line++; if (source[i] === '*' && source[i+1] === '/') { i += 2; break; } i++; }
      continue;
    }
    if (ch === "'" || ch === '"') { i = skipString(i); continue; }
    if (ch === '{') {
      const parentBodyStart = stack.length > 0 ? stack[stack.length-1].bodyStart : 0;
      const header = source.slice(parentBodyStart, i);
      const kw = extractLastKeyword(header);
      // Where the statement's keyword begins — used to capture the WHOLE block
      // text (keyword + args + braces) so it can be re-emitted verbatim.
      const rel = header.lastIndexOf(kw.keyword);
      const textStart = parentBodyStart + (rel >= 0 ? rel : header.length);
      const block: Block = { keyword: kw.keyword, args: kw.args, body: '', startLine: line, endLine: 0, children: [] };
      if (stack.length > 0) { stack[stack.length-1].block.children.push(block); } else { roots.push(block); }
      stack.push({ block, bodyStart: i+1, origBodyStart: i+1, textStart }); i++; continue;
    }
    if (ch === '}') {
      if (stack.length > 0) {
        const { block, bodyStart, origBodyStart, textStart } = stack.pop()!;
        block.body = source.slice(bodyStart, i); block.endLine = line;
        // Full body from the opening brace — statements written BEFORE a child
        // block live only here, not in `body` (which keeps the trailing segment).
        block.fullBody = source.slice(origBodyStart, i);
        block.rawText = source.slice(textStart, i + 1);
        if (stack.length > 0) stack[stack.length-1] = { ...stack[stack.length-1], bodyStart: i+1 };
      }
      i++; continue;
    }
    if (ch === '\n') line++;
    i++;
  }
  // EOF: close remaining open blocks (handles partial / unbalanced input)
  while (stack.length > 0) {
    const { block, bodyStart } = stack.pop()!;
    block.body = source.slice(bodyStart); block.endLine = line;
    if (stack.length > 0) stack[stack.length-1] = { ...stack[stack.length-1], bodyStart: source.length };
  }
  return roots;
}

function extractLastKeyword(segment: string): { keyword: string; args: string } {
  const lines = segment.split('\n');
  let lastLine = '';
  for (let l = lines.length - 1; l >= 0; l--) {
    const t = lines[l].trim();
    if (t && !t.startsWith('//') && !t.startsWith('*')) { lastLine = t; break; }
  }
  // Greedy args match so names containing parentheses survive, e.g.
  //   stage('Free RAM (staging)')  →  keyword='stage', args="'Free RAM (staging)'"
  // The old non-greedy `[^)]*` stopped at the first ')' and fell through,
  // leaving the whole expression as the keyword → stage skipped by callers.
  const withArgs = lastLine.match(/^([\w][\w.]*)\s*\(([\s\S]*)\)\s*$/);
  if (withArgs) return { keyword: withArgs[1], args: withArgs[2].trim() };
  const wordAtEnd = lastLine.match(/(\w[\w.]*)\s*$/);
  if (wordAtEnd) return { keyword: wordAtEnd[1], args: '' };
  return { keyword: lastLine.trim(), args: '' };
}

// ─── Declarative parser ───────────────────────────────────────────────────────

function parseDeclarative(source: string, errors: ParseError[]): GraphModel {
  const blocks = tokenizeBlocks(source);
  const pipelineBlock = blocks.find(b => b.keyword === 'pipeline');
  if (!pipelineBlock) {
    errors.push({ line: 1, column: 0, message: 'No pipeline { } block found', severity: 'error' });
    return { nodes: [], edges: [], meta: { declarative: true } };
  }
  const nodes: JenkinsNode[] = []; const edges: JenkinsEdge[] = []; 
  const meta: GraphModel['meta'] = { declarative: true };
  // Preserve everything OUTSIDE `pipeline { }` (top-level Groovy helpers,
  // constants, @Library…). The graph only models the declarative pipeline, so
  // without this a full regeneration would silently delete hundreds of lines.
  const raw = pipelineBlock.rawText;
  if (raw) {
    const idx = source.indexOf(raw);
    if (idx >= 0) {
      meta.preamble = source.slice(0, idx);
      meta.epilogue = source.slice(idx + raw.length);
    }
  }
  const pipelineNode = makeNode('pipeline', 'pipeline', { kind: 'pipeline' });
  nodes.push(pipelineNode);

  // Agent
  const agentBlock = pipelineBlock.children.find(c => c.keyword === 'agent');
  if (agentBlock) {
    const an = makeNode('agent', 'agent', parseAgent(agentBlock.body));
    nodes.push(an); edges.push(makeEdge(pipelineNode.id, an.id, 'contains'));
  } else {
    // Search the full source: pipelineBlock.body only holds the last interstitial
    // segment after the final child block, so inline `agent any/none` (which
    // appears before the first child) would otherwise be missed.
    const im = source.match(/^\s*agent\s+(any|none)\s*$/m);
    if (im) {
      const an = makeNode('agent', 'agent', { type: im[1] });
      nodes.push(an); edges.push(makeEdge(pipelineNode.id, an.id, 'contains'));
    }
  }

  // Environment / options / parameters / triggers
  const envBlock = pipelineBlock.children.find(c => c.keyword === 'environment');
  if (envBlock) meta.environment = { variables: parseEnvVars(envBlock.body) } as EnvironmentData;
  const optBlock = pipelineBlock.children.find(c => c.keyword === 'options');
  if (optBlock) meta.options = parseOptions(optBlock.body, optBlock.children) as GraphModel['meta']['options'];
  const paramsBlock = pipelineBlock.children.find(c => c.keyword === 'parameters');
  if (paramsBlock) meta.parameters = parseParameters(paramsBlock.body) as GraphModel['meta']['parameters'];
  const triggersBlock = pipelineBlock.children.find(c => c.keyword === 'triggers');
  if (triggersBlock) meta.triggers = parseTriggers(triggersBlock.body) as GraphModel['meta']['triggers'];

  // Stages
  const stagesBlock = pipelineBlock.children.find(c => c.keyword === 'stages');
  if (stagesBlock) {
    let prevId = pipelineNode.id;
    for (const sb of stagesBlock.children) {
      if (sb.keyword === 'stage') {
        const r = buildStageNodes(sb, prevId, errors);
        nodes.push(...r.nodes); edges.push(...r.edges); prevId = r.lastId;
      }
    }
  }

  // Post
  const postBlock = pipelineBlock.children.find(c => c.keyword === 'post');
  if (postBlock) {
    const VALID = ['always', 'success', 'failure', 'unstable', 'changed', 'aborted', 'cleanup'];
    for (const cb of postBlock.children) {
      if (!VALID.includes(cb.keyword)) continue;
      const pn = makeNode('post', `post: ${cb.keyword}`, { condition: cb.keyword, kind: 'post' });
      nodes.push(pn); edges.push(makeEdge(pipelineNode.id, pn.id, 'contains'));
      for (const sl of getSimpleLines(cb.fullBody ?? cb.body, cb.children)) {
        const sd = parseStep(sl); if (!sd) continue;
        const sn = makeNode('step', String(sd['type'] ?? 'step'), { ...sd, kind: 'step' });
        nodes.push(sn); edges.push(makeEdge(pn.id, sn.id, 'contains'));
      }
    }
  }

  return { nodes, edges, meta };
}

function buildStageNodes(
  block: Block, prevId: string, errors: ParseError[],
): { nodes: JenkinsNode[]; edges: JenkinsEdge[]; lastId: string } {
  const nodes: JenkinsNode[] = []; const edges: JenkinsEdge[] = [];
  const stageName = extractStringArg(block.args);
  const data: Record<string, unknown> = { name: stageName, label: stageName, kind: 'stage', sourceLine: block.startLine };
  const ab = block.children.find(c => c.keyword === 'agent'); if (ab) data['agent'] = parseAgent(ab.body);
  const wb = block.children.find(c => c.keyword === 'when'); if (wb) data['when'] = parseWhen(wb.body, wb.children);
  if (/failFast\s+true/.test(block.body)) data['failFast'] = true;
  const stageNode = makeNode('stage', stageName, data);
  nodes.push(stageNode); edges.push(makeEdge(prevId, stageNode.id, 'sequence'));

  const stepsBlock = block.children.find(c => c.keyword === 'steps');
  const parallelBlock = block.children.find(c => c.keyword === 'parallel')
    ?? stepsBlock?.children.find(c => c.keyword === 'parallel');
  // Nested `stages { }` (sequential stages, or the parent of a parallel matrix).
  // Jenkins allows stage('X') { stages { stage(...) { ... } } }; without this,
  // every nested stage is silently dropped and the graph shows only top-level stages.
  const nestedStagesBlock = block.children.find(c => c.keyword === 'stages');

  if (parallelBlock) {
    const branchNames: string[] = [];
    for (const bb of parallelBlock.children) {
      if (bb.keyword !== 'stage') continue;
      branchNames.push(extractStringArg(bb.args));
      const r = buildStageNodes(bb, stageNode.id, errors);
      if (r.edges.length > 0) r.edges[0] = { ...r.edges[0], type: 'parallel' };
      nodes.push(...r.nodes); edges.push(...r.edges);
    }
    const pn = makeNode('parallel', 'parallel', { branches: branchNames, kind: 'parallel' });
    nodes.push(pn); edges.push(makeEdge(stageNode.id, pn.id, 'contains'));
  } else if (nestedStagesBlock) {
    // Recurse into nested stages; the first child continues the sequence from this stage.
    let prevId = stageNode.id;
    for (const sb of nestedStagesBlock.children) {
      if (sb.keyword !== 'stage') continue;
      const r = buildStageNodes(sb, prevId, errors);
      nodes.push(...r.nodes); edges.push(...r.edges); prevId = r.lastId;
    }
  } else if (stepsBlock) {
    const BSMAP: Record<string, string> = {
      timeout: 'timeout', retry: 'retry', withcredentials: 'withCredentials',
      withenv: 'withEnv', script: 'script', docker: 'docker.build',
    };
    // Emit steps in SOURCE ORDER. Plain statements (sh, echo, checkout([…])) and
    // child blocks (script{…}, withCredentials([…]){…}) must not be reordered, or
    // a no-op sync would produce a diff (and change execution order).
    const fb = stepsBlock.fullBody ?? stepsBlock.body;
    type Item = { pos: number; type: string; data: Record<string, unknown> };
    const items: Item[] = [];

    // Child blocks first — record where each one starts in the body.
    const masked = removeChildBlocks(fb, stepsBlock.children);
    for (const child of stepsBlock.children) {
      if (child.keyword === 'parallel') continue;
      const kl = child.keyword.toLowerCase().replace(/\s*\(.*$/, '');
      const st = BSMAP[kl] ?? child.keyword;
      // Keep the WHOLE source text (keyword + args + braces), not just the body,
      // so script{}/withCredentials([…]){…} round-trip byte-for-byte.
      const raw = (child.rawText ?? `${child.keyword} ${child.args} {\n${child.body}}`).trim();
      const pos = fb.indexOf(raw);
      items.push({ pos: pos >= 0 ? pos : Number.MAX_SAFE_INTEGER, type: st, data: { type: st, kind: 'step', rawContent: raw } });
    }

    // Plain statements — position them by searching the masked body.
    for (const sl of getSimpleLines(fb, stepsBlock.children)) {
      const sd = parseStep(sl); if (!sd) continue;
      items.push({ pos: masked.indexOf(sl), type: String(sd['type'] ?? 'step'), data: { ...sd, kind: 'step' } });
    }

    items.sort((a, b) => a.pos - b.pos);
    for (const it of items) {
      const sn = makeNode('step', it.type, it.data);
      nodes.push(sn); edges.push(makeEdge(stageNode.id, sn.id, 'contains'));
    }
  }
  return { nodes, edges, lastId: stageNode.id };
}

// ─── Scripted (basic) ─────────────────────────────────────────────────────────

function parseScripted(source: string, errors: ParseError[]): GraphModel {
  const nodes: JenkinsNode[] = []; const edges: JenkinsEdge[] = [];
  const blocks = tokenizeBlocks(source);
  const nb = blocks.find(b => b.keyword === 'node') ?? blocks[0];
  if (!nb) {
    errors.push({ line: 0, column: 0, message: 'Scripted pipeline: no node {} block found', severity: 'warning' });
    return { nodes, edges, meta: { declarative: false } };
  }
  const pn = makeNode('pipeline', 'pipeline', { kind: 'pipeline' });
  nodes.push(pn);
  // Recurse so nested stages (inside `if`, `timestamps {}`, parallel, …) are found.
  const r = buildScriptedStages(nb, pn.id);
  nodes.push(...r.nodes); edges.push(...r.edges);
  return { nodes, edges, meta: { declarative: false } };
}

function buildScriptedStages(
  block: Block, prevId: string,
): { nodes: JenkinsNode[]; edges: JenkinsEdge[]; lastId: string } {
  const nodes: JenkinsNode[] = []; const edges: JenkinsEdge[] = [];
  let lastId = prevId;
  for (const child of block.children) {
    if (child.keyword === 'stage') {
      const name = extractStringArg(child.args);
      const sn = makeNode('stage', name, { name, label: name, kind: 'stage', sourceLine: child.startLine });
      nodes.push(sn); edges.push(makeEdge(lastId, sn.id, 'sequence')); lastId = sn.id;
      for (const sl of getSimpleLines(child.fullBody ?? child.body, child.children)) {
        const sd = parseStep(sl); if (!sd) continue;
        const stn = makeNode('step', String(sd['type'] ?? 'step'), { ...sd, kind: 'step' });
        nodes.push(stn); edges.push(makeEdge(sn.id, stn.id, 'contains'));
      }
    } else if (child.children.length > 0) {
      // Recurse into wrappers (node, timestamps, if, parallel, …).
      const rr = buildScriptedStages(child, lastId);
      nodes.push(...rr.nodes); edges.push(...rr.edges); lastId = rr.lastId;
    }
  }
  return { nodes, edges, lastId };
}

// ─── Exported specialised parsers ────────────────────────────────────────────

export function parseAgent(body: string): Record<string, unknown> {
  const t = body.trim();
  if (!t || t === 'any') return { type: 'any' };
  if (t === 'none') return { type: 'none' };
  const imageM = t.match(/image\s+['"]([^'"]+)['"]/);
  if (imageM) {
    const argsM = t.match(/args\s+['"]([^'"]+)['"]/);
    return { type: 'docker', image: imageM[1], args: argsM?.[1] };
  }
  if (/dockerfile/.test(t)) {
    const fm = t.match(/filename\s+['"]([^'"]+)['"]/);
    return { type: 'dockerfile', filename: fm?.[1] ?? 'Dockerfile' };
  }
  const labelM = t.match(/label\s+['"]([^'"]+)['"]/);
  if (labelM) return { type: 'label', label: labelM[1] };
  return { type: 'any' };
}

export function parseWhen(body: string, children: Block[] = []): Record<string, unknown> {
  const t = body.trim();
  // Combinator written directly on the `when` body: anyOf/allOf/not.
  const comb = t.match(/^\s*(anyOf|allOf|not)\b/);
  if (comb) return { type: comb[1], conditions: collectWhenConditions(t, children) };

  // Leaf condition on the body (branch / environment / tag / expression).
  const leaf = t ? parseWhenLeaf(t) : null;
  if (leaf) return leaf;

  // Condition expressed as a child block: `expression { }`, `anyOf { }`, `not { }`.
  if (children.length === 1) {
    const c = children[0];
    if (c.keyword === 'anyOf' || c.keyword === 'allOf' || c.keyword === 'not') {
      return { type: c.keyword, conditions: collectWhenConditions(c.body, c.children) };
    }
    return { type: 'expression', value: c.body.trim() };
  }
  if (children.length > 1) {
    return { type: 'allOf', conditions: children.map(c => ({ type: 'expression', value: c.body.trim() })) };
  }
  return { type: 'expression', value: t };
}

/** Parses a single leaf condition line (branch / environment / tag / expression). */
function parseWhenLeaf(t: string): Record<string, unknown> | null {
  const brM = t.match(/^\s*branch\s+['"]([^'"]+)['"]/m); if (brM) return { type: 'branch', value: brM[1] };
  const envM = t.match(/environment\s+name:\s*['"]([^'"]+)['"],\s*value:\s*['"]([^'"]+)['"]/);
  if (envM) return { type: 'environment', name: envM[1], value: envM[2] };
  const exM = t.match(/^\s*expression\s*\{([\s\S]*)\}/); if (exM) return { type: 'expression', value: exM[1].trim() };
  const tagM = t.match(/^\s*tag\s+['"]([^'"]+)['"]/); if (tagM) return { type: 'tag', value: tagM[1] };
  return null;
}

/** Collects the conditions of an anyOf/allOf/not — from child blocks AND body lines. */
function collectWhenConditions(body: string, children: Block[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const c of children) {
    if (c.keyword === 'anyOf' || c.keyword === 'allOf' || c.keyword === 'not') {
      out.push({ type: c.keyword, conditions: collectWhenConditions(c.body, c.children) });
    } else if (c.keyword === 'expression') {
      out.push({ type: 'expression', value: c.body.trim() });
    } else {
      const leaf = parseWhenLeaf(c.keyword + ' ' + c.body.trim());
      if (leaf) out.push(leaf);
    }
  }
  for (const line of body.split(/[\n;]/)) {
    const s = line.trim();
    if (!s || s.startsWith('//')) continue;
    const leaf = parseWhenLeaf(s);
    if (leaf) out.push(leaf);
  }
  return out;
}

// ─── Meta parsers ─────────────────────────────────────────────────────────────

function parseEnvVars(body: string): Array<{ key: string; value: string; isSecret?: boolean }> {
  const r: Array<{ key: string; value: string; isSecret?: boolean }> = [];
  for (const raw of body.split('\n')) {
    const t = raw.trim(); if (!t || t.startsWith('//')) continue;
    const credM = t.match(/^(\w+)\s*=\s*credentials\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (credM) { r.push({ key: credM[1], value: credM[2], isSecret: true }); continue; }
    const kv = t.match(/^(\w+)\s*=\s*['"]([^'"]*)['"]/);
    if (kv) r.push({ key: kv[1], value: kv[2] });
  }
  return r;
}

function parseOptions(body: string, children: Block[] = []): Record<string, unknown> {
  const c = body + '\n' + children.map(x => x.keyword + ' ' + x.body).join('\n');
  const o: Record<string, unknown> = {};
  const to = c.match(/timeout\s*\(\s*time:\s*(\d+)\s*,\s*unit:\s*['"](\w+)['"]\s*\)/);
  if (to) o['timeout'] = { time: parseInt(to[1]), unit: to[2] };
  if (/disableConcurrentBuilds/.test(c)) o['disableConcurrentBuilds'] = true;
  if (/skipDefaultCheckout/.test(c)) o['skipDefaultCheckout'] = true;
  const nk = c.match(/numToKeepStr\s*:\s*['"](\d+)['"]/); if (nk) o['buildDiscarder'] = { numToKeepStr: nk[1] };
  return o;
}

function parseParameters(body: string): Array<Record<string, unknown>> {
  const p: Array<Record<string, unknown>> = [];
  // Scan each `type( … )` call with balanced parentheses so multi-line params,
  // unquoted booleans/numbers and nested brackets (choice choices: [...]) work.
  const re = /(string|booleanParam|choice|text|password)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const inner = readBalanced(body, m.index + m[0].length);
    if (!inner) break;
    re.lastIndex = inner.end;
    const innerText = inner.text;
    const nM = innerText.match(/name:\s*['"]([^'"]+)['"]/);
    if (!nM) continue;
    const dQuoted = innerText.match(/defaultValue:\s*['"]([^'"]*)['"]/);
    const dBare = innerText.match(/defaultValue:\s*([^,\n)]+)/);
    const descM = innerText.match(/description:\s*['"]([^'"]*)['"]/);
    const chM = innerText.match(/choices:\s*\[([\s\S]*?)\]/);
    const choices = chM
      ? chM[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
      : undefined;
    p.push({
      type: m[1],
      name: nM[1],
      defaultValue: dQuoted ? dQuoted[1] : (dBare ? dBare[1].trim() : ''),
      description: descM ? descM[1] : '',
      ...(choices ? { choices } : {}),
    });
  }
  return p;
}

/** Reads the inner text of a balanced `( … )` group starting after the open paren. */
function readBalanced(source: string, start: number): { text: string; end: number } | null {
  let depth = 1; let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "'" || ch === '"') {
      const q = ch; i++;
      while (i < source.length && source[i] !== q) { if (source[i] === '\\') i++; i++; }
    } else if (ch === '(' || ch === '[') { depth++; }
    else if (ch === ')' || ch === ']') { depth--; if (depth === 0) return { text: source.slice(start, i), end: i + 1 }; }
    i++;
  }
  return null;
}

function parseTriggers(body: string): Array<Record<string, unknown>> {
  const r: Array<Record<string, unknown>> = [];
  const cron = body.match(/cron\s*\(\s*['"]([^'"]+)['"]\s*\)/); if (cron) r.push({ type: 'cron', schedule: cron[1] });
  const poll = body.match(/pollSCM\s*\(\s*['"]([^'"]+)['"]\s*\)/); if (poll) r.push({ type: 'pollSCM', schedule: poll[1] });
  return r;
}

// ─── Graph helpers ────────────────────────────────────────────────────────────

function makeNode(kind: NodeKind, label: string, data: Record<string, unknown>): JenkinsNode {
  return { id: nextId(kind), kind, label, data, position: { x: 0, y: 0 } };
}

function makeEdge(source: string, target: string, type: JenkinsEdge['type'] = 'sequence'): JenkinsEdge {
  return { id: `edge-${source}-${target}`, source, target, type };
}

function extractStringArg(args: string): string {
  const m = args.match(/['"]([^'"]+)['"]/); return m ? m[1] : args.replace(/['"]/g, '').trim();
}

function getSimpleLines(body: string, children?: Block[]): string[] {
  // Blank out direct child blocks so their bodies don't interfere, then scan the
  // whole (full) body. Callers pass `fullBody`; masking the children is what makes
  // statements written BEFORE a child block (checkout([…]), sh '''…''' before a
  // `script {}`) visible instead of being dropped.
  const src = children && children.length > 0 ? removeChildBlocks(body, children) : body;
  const result: string[] = []; let depth = 0;
  // Accumulate a statement across lines while inside (), [], or an open string,
  // so multi-line steps (sh '''…''', checkout([…])) are captured whole instead of
  // being sliced line-by-line and silently dropped.
  let buf = ''; let inStr: string | null = null; let inTriple = false;
  const flush = () => {
    const t = buf.trim();
    if (t && !t.startsWith('//') && t !== '}' && t !== '{') result.push(t);
    buf = '';
  };
  for (const rawLine of src.split('\n')) {
    buf += (buf ? '\n' : '') + rawLine;
    for (let i = 0; i < rawLine.length; i++) {
      const ch = rawLine[i];
      if (inTriple) {
        if (rawLine.slice(i, i + 3) === inStr) { inTriple = false; inStr = null; i += 2; }
        continue;
      }
      if (inStr) {
        if (ch === '\\') { i++; continue; }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === "'" || ch === '"') {
        if (rawLine.slice(i, i + 3) === ch + ch + ch) { inStr = ch + ch + ch; inTriple = true; i += 2; }
        else inStr = ch;
        continue;
      }
      if (ch === '{') depth++; else if (ch === '}') depth--;
      else if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
    }
    // Statement complete only when brackets are balanced, no open string, and the
    // line does not open a block (ends with `{`).
    const t = buf.trim();
    const opensBlock = depth === 0 && t.endsWith('{');
    if (depth <= 0 && !inStr && !inTriple && !opensBlock) flush();
  }
  flush();
  return result;
}

/**
 * Blanks out the text spans covered by direct child blocks so the parent's
 * statements can be scanned without their bodies interfering. The tokenizer only
 * stores the trailing body segment, so without this, statements written BEFORE a
 * child block (e.g. `checkout([…])` and `sh '''…'''` before a `script {}`) are lost.
 */
function removeChildBlocks(body: string, children: Block[]): string {
  let out = body;
  for (const c of children) {
    const raw = c.rawText;
    if (!raw) continue;
    const idx = out.indexOf(raw);
    if (idx < 0) continue;
    out = out.slice(0, idx) + ' '.repeat(raw.length) + out.slice(idx + raw.length);
  }
  return out;
}
