// src/shared/types.ts
// Types partagés entre l'extension host et la webview
// IMPORTANT : ce fichier NE doit pas importer de modules Node.js ou VSCode

export type NodeKind =
  | 'pipeline'
  | 'agent'
  | 'stage'
  | 'step'
  | 'parallel'
  | 'post'
  | 'environment'
  | 'options'
  | 'parameters'
  | 'triggers'
  | 'when';

export type AgentData = {
  type: 'any' | 'none' | 'label' | 'docker' | 'dockerfile';
  label?: string;
  image?: string;
  filename?: string;
  args?: string;
  reuseNode?: boolean;
};

export type StageData = {
  name: string;
  when?: WhenData;
  agent?: AgentData;
  failFast?: boolean;
  sourceLine?: number;
};

export type StepType =
  | 'sh'
  | 'echo'
  | 'git'
  | 'checkout'
  | 'archiveArtifacts'
  | 'junit'
  | 'withCredentials'
  | 'timeout'
  | 'retry'
  | 'withEnv'
  | 'docker.build'
  | 'docker.push'
  | 'slackSend'
  | 'mail'
  | 'cleanWs'
  | 'script'
  | 'custom';

export type StepData = {
  type: StepType;
  label?: string;
  sourceLine?: number;
  // sh
  script?: string;
  returnStdout?: boolean;
  returnStatus?: boolean;
  // echo
  message?: string;
  // git / checkout
  url?: string;
  branch?: string;
  credentialsId?: string;
  // archiveArtifacts
  artifacts?: string;
  fingerprint?: boolean;
  // junit
  pattern?: string;
  // timeout
  time?: number;
  unit?: 'SECONDS' | 'MINUTES' | 'HOURS' | 'DAYS';
  // retry
  count?: number;
  // mail
  to?: string;
  subject?: string;
  body?: string;
  // slackSend
  channel?: string;
  color?: string;
  // generic / custom
  rawContent?: string;
  [key: string]: unknown;
};

export type ParallelData = {
  branches: string[];
  failFast?: boolean;
};

export type PostCondition = 'always' | 'success' | 'failure' | 'unstable' | 'changed' | 'aborted' | 'cleanup';

export type PostData = {
  condition: PostCondition;
};

export type WhenType = 'branch' | 'environment' | 'expression' | 'anyOf' | 'allOf' | 'not' | 'tag' | 'changeRequest' | 'buildingTag';

export type WhenData = {
  type: WhenType;
  value?: string;
  name?: string;        // pour environment
  conditions?: WhenData[];
};

export type EnvironmentData = {
  variables: Array<{ key: string; value: string; isSecret?: boolean }>;
};

export type OptionsData = {
  timeout?: { time: number; unit: string };
  disableConcurrentBuilds?: boolean;
  buildDiscarder?: { numToKeepStr?: string; daysToKeepStr?: string };
  skipDefaultCheckout?: boolean;
  retry?: number;
  timestamps?: boolean;
};

export type ParameterDef = {
  type: 'string' | 'boolean' | 'choice' | 'text' | 'password';
  name: string;
  defaultValue?: string;
  description?: string;
  choices?: string[];
};

export type TriggerDef = {
  type: 'cron' | 'pollSCM' | 'upstream' | 'githubPush';
  schedule?: string;
  projects?: string[];
};

export type JenkinsNode = {
  id: string;
  kind: NodeKind;
  label: string;
  data:
    | AgentData
    | StageData
    | StepData
    | ParallelData
    | PostData
    | WhenData
    | EnvironmentData
    | OptionsData
    | Record<string, unknown>;
  position: { x: number; y: number };
};

export type EdgeType = 'sequence' | 'parallel' | 'condition' | 'contains';

export type JenkinsEdge = {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  label?: string;
};

export type GraphModel = {
  nodes: JenkinsNode[];
  edges: JenkinsEdge[];
  meta: {
    jenkinsVersion?: string;
    declarative: boolean;
    options?: OptionsData;
    parameters?: ParameterDef[];
    triggers?: TriggerDef[];
    environment?: EnvironmentData;
  };
};

export type ValidationError = {
  nodeId?: string;
  severity: 'error' | 'warning';
  message: string;
  line?: number;
  column?: number;
};

export type ExtensionConfig = {
  jenkinsUrl: string;
  jenkinsUser: string;
  jenkinsToken: string;
  autoLayout: boolean;
  syncDelay: number;
};

export type StepDefinition = {
  name: string;
  displayName: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
};

export type VSCodeTheme = 'light' | 'dark' | 'high-contrast';

export type BuildStatus = 'idle' | 'running' | 'success' | 'failure' | 'aborted';
