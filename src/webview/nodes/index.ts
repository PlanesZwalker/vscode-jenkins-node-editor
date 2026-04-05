// src/webview/nodes/index.ts
// Export de la map nodeTypes pour React Flow

import StageNode from './StageNode';
import StepNode from './StepNode';
import AgentNode from './AgentNode';
import ParallelNode from './ParallelNode';
import PostNode from './PostNode';

export const nodeTypes = {
  stage:    StageNode,
  step:     StepNode,
  agent:    AgentNode,
  parallel: ParallelNode,
  post:     PostNode,
  // pipeline est traité comme un StageNode spécial
  pipeline: StageNode,
} as const;
