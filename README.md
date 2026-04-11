# Jenkins Node Editor

<div align="center">

<img src="media/icon.png" alt="Jenkins Node Editor icon" width="128" height="128" />

> **A VS Code extension that turns any `Jenkinsfile` into an interactive visual node graph — edit it, run builds, and stream logs, all without leaving your editor.**

![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-007ACC?logo=visual-studio-code&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Tests](https://img.shields.io/badge/tests-19%20passed-brightgreen)
![Build](https://img.shields.io/badge/build-passing-brightgreen)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Data Flow](#data-flow)
- [Node Types](#node-types)
- [Message Protocol](#message-protocol)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Security](#security)
- [Development](#development)
- [Testing](#testing)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Jenkins Node Editor renders a `Jenkinsfile` as a **live, editable node graph** powered by [React Flow](https://reactflow.dev/). Changes made in the graph are immediately reflected in the source file, and changes made in the text editor instantly update the graph — a true **bidirectional sync**.

The UI is styled after **Blue Ocean**, Jenkins' own modern pipeline visualization UI.

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code Window                           │
│                                                                 │
│  ┌─────────────────────────┐   ┌───────────────────────────┐   │
│  │   Text Editor (classic) │◄──►  Jenkins Node Editor       │   │
│  │                         │   │  (Custom Editor Webview)   │   │
│  │  pipeline {             │   │                            │   │
│  │    agent any            │   │  ┌─────┐  ┌───────┐       │   │
│  │    stages {             │   │  │Agent│─►│ Build │       │   │
│  │      stage('Build') {   │   │  └─────┘  └───┬───┘       │   │
│  │        ...              │   │               │            │   │
│  │      }                  │   │           ┌───▼───┐        │   │
│  │    }                    │   │           │ Test  │        │   │
│  │  }                      │   │           └───┬───┘        │   │
│  │                         │   │               │            │   │
│  └─────────────────────────┘   │           ┌───▼───┐        │   │
│                                │           │Deploy │        │   │
│                                └───────────┴───────┴────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Visual Graph Editor** | Drag, drop, and connect pipeline nodes on a Blue Ocean–styled canvas |
| **Bidirectional Sync** | Edit text → graph updates; edit graph → text updates |
| **Drag-safe Sync** | Sync is deliberately skipped while a node is being dragged — no mid-drag remounts |
| **Undo / Redo** | Full undo/redo history for node and edge changes via `zundo` (↩ / ↪ in toolbar) |
| **Auto-layout** | Dagre-powered automatic node positioning on open |
| **Declarative Parser** | Full support for `pipeline {}`, `stages`, `agent`, `when`, `environment`, `parameters`, `triggers`, `post` |
| **Scripted Fallback** | Basic `node {}` scripted pipeline support |
| **Node Palette** | 20+ node types in collapsible groups — drag onto canvas to add |
| **Rich Node Inspector** | Full property editor for every node type: env vars, parameters, options, triggers, `when` conditions, post conditions, all step types |
| **Validation** | Local syntax check + optional remote Jenkins API validation with inline node error markers |
| **CSRF-safe Builds** | Fetches a Jenkins CSRF crumb before every POST; crumb is cached and invalidated on 403 |
| **Secure Token Storage** | Jenkins API token stored in VS Code's encrypted **SecretStorage**, never in `settings.json` |
| **Build Trigger** | Trigger Jenkins builds directly from the editor |
| **Log Streaming** | Real-time build log streaming via Jenkins' progressive text API |
| **Theme Support** | Follows VS Code light / dark / high-contrast themes |
| **Position Memory** | Node positions persisted in `.vscode/` between sessions |
| **Error Boundary** | React ErrorBoundary wraps the root — crashes show a readable error panel, not a blank screen |

---

## Architecture

The extension is split into two isolated runtimes that communicate via a typed message bus.

```mermaid
graph TB
    subgraph "Extension Host (Node.js)"
        EXT["extension.ts\nActivate / Commands"]
        EDITOR["JenkinsNodeEditor\nCustomTextEditorProvider"]
        BUS["MessageBus\nTyped pub/sub bridge"]
        PARSER["JenkinsfileParser\nJenkinsfile → GraphModel"]
        GEN["JenkinsfileGenerator\nGraphModel → Jenkinsfile"]
        VALIDATOR["JenkinsValidator\nLocal + Remote validation"]
        CLIENT["JenkinsClient\nREST API + CSRF crumb"]
        POSSTORE["PositionStore\nPersist node positions"]
        SECRETS["SecretStorage\nEncrypted token store"]
        LOGGER["logger\nOutput channel"]
    end

    subgraph "Webview (React / Vite)"
        APP["App.tsx\nRoot component"]
        BOUNDARY["ErrorBoundary\nCrash fallback"]
        CANVAS["NodeCanvas\nReact Flow container"]
        PALETTE["NodePalette\n20+ node types, collapsible"]
        INSPECTOR["NodeInspector\nFull property editor"]
        TOOLBAR["Toolbar\nUndo/Redo/Validate/Run/Help"]
        LOGPANEL["LogPanel\nBuild log display"]
        STORE["graphStore (Zustand + zundo)\nUndo/redo-aware state"]
        BRIDGE["useVSCodeBridge\npostMessage + drag guard"]
        SYNC["useGraphSync\nDrag-safe debounced sync"]
        NODES["Node Components\nStage/Step/Agent/Parallel/Post"]
    end

    subgraph "Shared (no runtime deps)"
        TYPES["shared/types.ts\nAll TypeScript types"]
        MESSAGES["shared/messages.ts\nMessage discriminated unions"]
    end

    EXT --> EDITOR
    EDITOR --> BUS
    EDITOR --> PARSER
    EDITOR --> GEN
    EDITOR --> VALIDATOR
    EDITOR --> CLIENT
    EDITOR --> POSSTORE
    EDITOR --> SECRETS
    BUS <-->|"postMessage\nonDidReceiveMessage"| BRIDGE
    BRIDGE --> STORE
    STORE --> CANVAS
    STORE --> INSPECTOR
    STORE --> TOOLBAR
    SYNC --> BUS
    CANVAS --> NODES
    APP --> BOUNDARY
    BOUNDARY --> CANVAS
```

---

## Data Flow

### Opening a Jenkinsfile

```mermaid
sequenceDiagram
    participant VSCode
    participant JNE as JenkinsNodeEditor
    participant Secrets as SecretStorage
    participant Parser
    participant Bus as MessageBus
    participant Store as graphStore
    participant UI as React UI

    VSCode->>JNE: resolveCustomTextEditor(document)
    JNE->>JNE: getWebviewHtml() → inject nonce + CSP
    JNE->>Secrets: resolveToken() — migrate legacy settings token if present
    JNE->>Bus: create MessageBus
    UI->>Bus: READY
    Bus->>JNE: on('READY')
    JNE->>Parser: parse(document.getText())
    Parser-->>JNE: { graph, errors, mode }
    JNE->>JNE: mergePositions(graph, savedPositions)
    JNE->>Bus: send INIT { graph, theme, config }
    Bus->>Store: dispatch INIT
    Store->>Store: setNodes / setEdges / autoLayout
    Store->>UI: re-render
```

### Editing the Graph → File Sync

```mermaid
sequenceDiagram
    participant User
    participant RF as React Flow
    participant Store as graphStore
    participant Sync as useGraphSync
    participant Bus as MessageBus
    participant JNE as JenkinsNodeEditor
    participant Gen as Generator
    participant Doc as TextDocument

    User->>RF: drag END / edit node / connect edge
    RF->>Store: onNodesChange (dragging=false) / onEdgesChange / onConnect
    Store->>Store: isDirty = true
    Note over Sync: isDragging check — skips sync while any node.dragging=true
    Sync->>Bus: GRAPH_CHANGED { graph } (after 300ms debounce)
    Bus->>JNE: on('GRAPH_CHANGED')
    JNE->>JNE: syncDepth++ (depth counter, not boolean flag)
    JNE->>Gen: generate(graph)
    Gen-->>JNE: Jenkinsfile text
    JNE->>Doc: WorkspaceEdit.replace(fullRange, text)
    JNE->>JNE: syncDepth-- (in finally)
```

### Text Edit → Graph Sync

```mermaid
sequenceDiagram
    participant User
    participant Doc as TextDocument
    participant JNE as JenkinsNodeEditor
    participant Parser
    participant Bus as MessageBus
    participant Bridge as useVSCodeBridge
    participant Store as graphStore

    User->>Doc: type in text editor
    Doc->>JNE: onDidChangeTextDocument
    JNE->>JNE: if syncDepth > 0 → skip (anti-loop)
    JNE->>Parser: parse(document.getText())
    Parser-->>JNE: { graph }
    JNE->>JNE: mergePositions(graph, saved)
    JNE->>Bus: send DOC_CHANGED { graph }
    Bus->>Bridge: message event
    Bridge->>Bridge: if any node.dragging → drop message (drag guard)
    Bridge->>Store: setNodes / setEdges
```

---

## Node Types

The graph model uses 5 rendered node kinds and a rich property inspector for each:

```mermaid
graph LR
    subgraph "Pipeline Structure"
        P([🔵 pipeline]) --> A([🟢 agent])
        P --> S1([🟣 stage: Build])
        P --> S2([🟣 stage: Test])
        P --> S3([🟣 stage: Deploy])
        P --> POST([🔴 post])
    end

    subgraph "Stage Children"
        S1 --> ST1([🔵 step: sh])
        S1 --> ST2([🔵 step: archiveArtifacts])
        S2 --> ST3([🔵 step: sh])
        S2 --> ST4([🔵 step: junit])
    end

    subgraph "Parallel Stage"
        S3 --> PAR([🟡 parallel])
        PAR --> B1([🟣 stage: Branch A])
        PAR --> B2([🟣 stage: Branch B])
    end
```

| Kind | Color | Description | Inspector sections |
|------|-------|-------------|-------------------|
| `pipeline` | 🔵 Blue | Root container node | Global agent, environment vars, parameters, options, triggers |
| `agent` | 🩵 Cyan | Execution agent | Type (any/none/label/docker/dockerfile) + type-specific fields |
| `stage` | 🟣 Purple | Named pipeline stage | Name, agent override, `when` condition, `failFast`, env vars |
| `step` | 🔵 Teal | Individual build step | Type selector + all step-specific fields (sh/echo/git/checkout/archiveArtifacts/junit/timeout/retry/script/withCredentials/input/custom) |
| `parallel` | 🟡 Amber | Parallel execution group | `failFast` toggle |
| `post` | 🔴 Red | Post-build condition | Condition (always/success/failure/unstable/changed/fixed/regression/aborted/cleanup) |

### Supported Step Types

| Step | Generated Groovy |
|------|-----------------|
| `sh` | `sh 'command'` |
| `bat` | `bat 'command'` |
| `echo` | `echo 'message'` |
| `git` | `git url: '…', branch: '…'` |
| `checkout` | `checkout scm` |
| `archiveArtifacts` | `archiveArtifacts artifacts: '**/*.jar'` |
| `junit` | `junit '**/surefire-reports/*.xml'` |
| `withCredentials` | `withCredentials([usernamePassword(…)]) { … }` |
| `timeout` | `timeout(time: 10, unit: 'MINUTES') { … }` |
| `retry` | `retry(3) { … }` |
| `input` | `input message: '…', ok: '…'` |
| `sleep` | `sleep time: 5, unit: 'SECONDS'` |
| `stash` / `unstash` | `stash name: '…' ` / `unstash '…'` |
| `slackSend` | `slackSend channel: '…', message: '…'` |
| `script` | Raw Groovy block |
| `custom` | Any other step — raw Groovy preserved |

---

## Message Protocol

Communication between the Extension Host and the Webview uses strongly-typed discriminated unions defined in `src/shared/messages.ts`.

### Extension → Webview

| Message Type | Payload |
|---|---|
| `INIT` | `{ graph: GraphModel, theme: VSCodeTheme, config: ExtensionConfig }` |
| `DOC_CHANGED` | `{ graph: GraphModel }` |
| `VALIDATION_RESULT` | `{ errors: ValidationError[] }` |
| `STEP_CATALOG` | `{ steps: StepDefinition[] }` |
| `LOG_LINE` | `{ line: string, stream: 'stdout' \| 'stderr' }` |
| `BUILD_STATUS` | `{ status: BuildStatus }` |
| `THEME_CHANGED` | `{ theme: VSCodeTheme }` |

### Webview → Extension

| Message Type | Payload |
|---|---|
| `READY` | _(none)_ — webview mounted |
| `GRAPH_CHANGED` | `{ graph: GraphModel }` |
| `VALIDATE_REQUEST` | `{ content?: string }` |
| `RUN_BUILD` | `{ jobName?: string, branch?: string, params?: Record<string,string> }` |
| `ABORT_BUILD` | `{ jobName?: string, buildNumber?: number }` |
| `ERROR` | `{ message: string, stack?: string }` |

---

## Project Structure

```
NodeCi/
├── 📄 package.json                  # Extension manifest + scripts
├── 📄 tsconfig.json                 # Extension host TypeScript config
├── 📄 tsconfig.webview.json         # Webview TypeScript config
├── 📄 vite.config.ts                # Webview build (Vite)
├── 📄 esbuild.config.js             # Extension build (esbuild)
├── 📄 vitest.config.ts              # Unit test config
│
├── 📁 media/
│   └── icon.png                    # Extension icon
│
├── 📁 src/
│   ├── 📁 extension/               # Extension host (Node.js runtime)
│   │   ├── extension.ts            # Activate / deactivate + commands (incl. setToken)
│   │   ├── JenkinsNodeEditor.ts    # CustomTextEditorProvider — SecretStorage, syncDepth
│   │   ├── MessageBus.ts           # Typed pub/sub bridge
│   │   ├── JenkinsValidator.ts     # Local + REST validation
│   │   ├── JenkinsClient.ts        # Jenkins REST API + CSRF crumb cache
│   │   ├── PositionStore.ts        # Persistent node positions
│   │   └── logger.ts               # VS Code output channel
│   │
│   ├── 📁 parser/                  # Jenkinsfile ↔ GraphModel
│   │   ├── JenkinsfileParser.ts    # Jenkinsfile → GraphModel
│   │   ├── JenkinsfileGenerator.ts # GraphModel → Jenkinsfile
│   │   └── layout.ts               # Dagre layout (extension-side)
│   │
│   ├── 📁 shared/                  # Zero-dependency shared types
│   │   ├── types.ts               # All domain types
│   │   └── messages.ts            # Message protocol discriminated unions
│   │
│   └── 📁 webview/                 # React UI (browser runtime)
│       ├── main.tsx               # React entry point + ErrorBoundary
│       ├── App.tsx                # Root layout component
│       ├── 📁 components/
│       │   ├── NodeCanvas.tsx     # React Flow canvas + drag/drop + welcome state
│       │   ├── NodePalette.tsx    # 20+ draggable node types in collapsible groups
│       │   ├── NodeInspector.tsx  # Full property editor (env vars, when, params, options…)
│       │   ├── Toolbar.tsx        # Undo/Redo + Validate/Run/Abort + Help panel
│       │   └── LogPanel.tsx       # Streaming build log display
│       ├── 📁 nodes/
│       │   ├── BaseNode.tsx       # Blue Ocean card chrome (glow on select, status dot)
│       │   ├── StageNode.tsx      # Stage node — when badge, failFast indicator
│       │   ├── StepNode.tsx       # Step node — type label + script preview
│       │   ├── AgentNode.tsx      # Agent node — type + detail
│       │   ├── ParallelNode.tsx   # Parallel node — branch count
│       │   ├── PostNode.tsx       # Post node — condition badge
│       │   └── index.ts           # Module-level nodeTypes map (avoids remount bug)
│       ├── 📁 hooks/
│       │   ├── useVSCodeBridge.ts # postMessage bridge + drag guard on DOC_CHANGED
│       │   ├── useGraphSync.ts    # Drag-safe debounced sync (skips while dragging)
│       │   └── useJenkinsAPI.ts   # Validate / run / abort hooks
│       ├── 📁 store/
│       │   └── graphStore.ts      # Zustand + immer + zundo (undo/redo, 50-state limit)
│       ├── 📁 utils/
│       │   ├── layout.ts          # Dagre auto-layout (webview-side)
│       │   └── theme.ts           # VS Code theme → CSS vars
│       └── 📁 styles/
│           └── globals.css        # Blue Ocean CSS variables + utility classes
│
├── 📁 test/
│   ├── runTests.js                # E2E test runner
│   ├── 📁 fixtures/
│   │   ├── simple.Jenkinsfile     # 3-stage declarative pipeline
│   │   ├── parallel.Jenkinsfile   # Parallel stages example
│   │   └── complex.Jenkinsfile    # Full-featured pipeline
│   └── 📁 suite/
│       └── parser.test.ts        # 19 Vitest unit tests
│
├── 📁 docs/
│   ├── PHASE1.md — PHASE6.md     # Phase-by-phase build notes
│
└── 📁 dist/                        # Build output (git-ignored)
    ├── extension.js               # Bundled extension host
    └── 📁 webview/
        ├── main.js               # Bundled React app
        └── main.css              # Bundled styles
```

---

## Installation

### From VS Code Marketplace

Search for **"Jenkins Node Editor"** in the Extensions panel (`Ctrl+Shift+X`), or install by ID:

```
PlanesZwalker.vscode-jenkins-node-editor
```

### From Source

**Prerequisites:** Node.js ≥ 20, npm ≥ 10, VS Code ≥ 1.85

```bash
git clone https://github.com/PlanesZwalker/vscode-jenkins-node-editor.git
cd vscode-jenkins-node-editor
npm install
npm run build
# Launch Extension Development Host:
# press F5 in VS Code, or install the .vsix:
npm run package
code --install-extension vscode-jenkins-node-editor-0.1.0.vsix
```

---

## Configuration

Open VS Code Settings (`Ctrl+,`) and search for **Jenkins Node Editor**:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `jenkinsNodeEditor.jenkinsUrl` | string | `""` | Jenkins server URL, e.g. `http://localhost:8080` |
| `jenkinsNodeEditor.jenkinsUser` | string | `""` | Jenkins username for API auth |
| `jenkinsNodeEditor.autoLayout` | boolean | `true` | Auto-layout graph when opening a file |
| `jenkinsNodeEditor.syncDelay` | number | `300` | Debounce delay (ms) before syncing graph → text |

> ⚠️ `jenkinsNodeEditor.jenkinsToken` has been **deprecated**. Use the secure command below instead.

### Setting the Jenkins API Token (secure)

The token is stored in VS Code's **encrypted SecretStorage**, not in `settings.json`:

```
Ctrl+Shift+P → Jenkins: Set Jenkins API Token (Secure)
```

On first launch, any token already in `settings.json` is **automatically migrated** to SecretStorage and removed from the file.

### Example `settings.json`

```json
{
  "jenkinsNodeEditor.jenkinsUrl": "http://jenkins.example.com:8080",
  "jenkinsNodeEditor.jenkinsUser": "alice",
  "jenkinsNodeEditor.autoLayout": true,
  "jenkinsNodeEditor.syncDelay": 300
}
```

---

## Usage

### Opening the Node Editor

1. Open any file named `Jenkinsfile`, `*.jenkinsfile`, `*.Jenkinsfile`, or `Jenkinsfile.*`
2. Click the **Jenkins Node Editor** icon in the editor title bar, **or** right-click the file in the Explorer → _Open Jenkins Node Editor_
3. The graph panel opens beside the text editor

### Editing Nodes

| Action | How |
|--------|-----|
| **Select node** | Click any node |
| **Move node** | Drag the node |
| **Edit properties** | Select node → Inspector panel (right) |
| **Add node** | Drag from the Node Palette (left) |
| **Delete node** | Select + `Delete` key |
| **Connect nodes** | Drag from a node's output handle (●) to another's input |
| **Undo / Redo** | `↩ Undo` / `↪ Redo` buttons in Toolbar (or use the toolbar buttons) |
| **Auto-layout** | `⊞ Layout` button in Toolbar |
| **Fit view** | `⊡ Fit` button in Toolbar |
| **Zoom** | Scroll wheel / pinch |
| **Pan** | Middle-click drag |
| **Keyboard help** | `? Help` button in Toolbar |

### Toolbar at a glance

```
[ ⊞ Layout ]  [ ⊡ Fit ]  |  [ ↩ Undo ]  [ ↪ Redo ]  |  [ ✓ Validate ]  ··· ▶ Run Build  |  [ ☰ Logs ]  [ ? Help ]
```

### Build Logs

When a build is running, the **Log Panel** shows at the bottom and streams log lines in real-time. The build status indicator in the Toolbar pulses blue while running, turns green on success, red on failure.

---

## Security

| Concern | Implementation |
|---------|----------------|
| **API token** | Stored in VS Code `SecretStorage` (OS-level encrypted), never in `settings.json` or committed to source control |
| **Token migration** | Existing `settings.json` tokens are auto-migrated to SecretStorage on first open, then removed from the file |
| **CSRF protection** | `JenkinsClient` fetches `/crumbIssuer/api/json` before every POST; crumb cached per client instance, invalidated on HTTP 403 |
| **Content Security Policy** | Webview uses a strict CSP with a per-session nonce — no `unsafe-eval`, no plain `unsafe-inline` for scripts |
| **No external network** | The webview has no internet access; all Jenkins calls go through the extension host |

---

## Development

### Build Scripts

```bash
npm run build         # Build everything (extension + webview)
npm run build:ext     # Build only the extension host (esbuild)
npm run build:web     # Build only the webview (Vite)
npm run watch         # Watch mode for both (use with F5)
npm run test:unit     # Vitest unit tests
npm run package       # Bundle as .vsix
npm run publish       # Publish to Marketplace (requires vsce login)
```

### Debugging with F5

1. Open the workspace in VS Code
2. Press `F5` → launches **Extension Development Host**
3. In the new window, open a `Jenkinsfile`
4. Set breakpoints in `src/extension/` for extension host code
5. For webview debugging: open _Developer Tools_ (`Ctrl+Shift+I`) and inspect the `<iframe>`

### Adding a New Node Type

1. Add the new `NodeKind` literal to `src/shared/types.ts`
2. Create `src/webview/nodes/MyNewNode.tsx` extending `BaseNode`
3. Register it in `src/webview/nodes/index.ts` (module-level constant — **not** inside a component)
4. Add a palette entry in `src/webview/components/NodePalette.tsx`
5. Add an inspector section in `NodeInspector.tsx`
6. Handle the kind in `JenkinsfileParser.ts` and `JenkinsfileGenerator.ts`

### Known Gotchas

- **`nodeTypes` must be a module-level constant** — declaring it inside a component causes React Flow to remount all nodes on every render
- **Sync is gated on drag end** — `onNodesChange` marks dirty only when `change.dragging === false`; `useGraphSync` skips while any node has `dragging: true`; `useVSCodeBridge` drops `DOC_CHANGED` messages during active drags

---

## Testing

### Unit Tests (Vitest)

```bash
npm run test:unit
```

19 tests covering the parser and generator:

```
✓ test/suite/parser.test.ts (19 tests)

  JenkinsfileParser — simple.Jenkinsfile
    ✓ parses without fatal errors
    ✓ detects declarative mode
    ✓ extracts 3 stage nodes (Build, Test, Deploy)
    ✓ stage names match Jenkinsfile
    ✓ extracts agent node (type: any)
    ✓ extracts post nodes
    ✓ all nodes have valid positions after layout
    ✓ edges connect stages in sequence

  JenkinsfileParser — parallel.Jenkinsfile
    ✓ parses without fatal errors
    ✓ detects parallel node
    ✓ parallel branches are present

  JenkinsfileParser — error cases
    ✓ empty string → error
    ✓ unbalanced braces → error
    ✓ partial input → partial graph

  JenkinsfileGenerator
    ✓ output contains 'pipeline' and 'stages'
    ✓ output ends with '}'
    ✓ indentation is divisible by 2
    ✓ round-trip preserves stage count
    ✓ generates agent block correctly

Test Files  1 passed (1)
     Tests  19 passed (19)
  Duration  ~500ms
```

### Test Fixtures

| Fixture | Description |
|---------|-------------|
| `simple.Jenkinsfile` | 3 stages (Build/Test/Deploy), `agent any`, post block |
| `parallel.Jenkinsfile` | Parallel stages, `failFast` |
| `complex.Jenkinsfile` | Environment vars, parameters, triggers, `when` conditions, Docker agent |

---

## Tech Stack

| Layer | Technology | Version | Role |
|-------|-----------|---------|------|
| Extension host | TypeScript | 5.x | Type-safe extension code |
| Extension build | esbuild | 0.20 | Fast CJS bundle for Node.js |
| Webview UI | React | 18 | Component-based UI |
| Webview build | Vite | 5 | Fast ESM webview bundle |
| Node graph | `@xyflow/react` | 12 | Interactive canvas |
| State | Zustand + immer | 4.x | Immutable reactive store |
| Undo/redo | zundo | 2.x | Temporal middleware for Zustand |
| Layout | dagre | 0.8.5 | Directed-graph auto-layout |
| Unit tests | Vitest | 1.x | Fast test runner |
| E2E tests | `@vscode/test-electron` | 2.x | Real VS Code instance |

---

## Contributing

1. Fork and clone the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Install dependencies: `npm install`
4. Make your changes and add tests
5. Ensure all tests pass: `npm run test:unit`
6. Ensure the build is clean: `npm run build`
7. Open a Pull Request

---

## License

Apache 2.0 © 2026 [PlanesZwalker](https://github.com/PlanesZwalker) — see [LICENSE](LICENSE) for details.


<div align="center">

![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-007ACC?logo=visual-studio-code&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![License](https://img.shields.io/badge/license-Apache%202.0-blue)
![Tests](https://img.shields.io/badge/tests-19%20passed-brightgreen)
![Build](https://img.shields.io/badge/build-passing-brightgreen)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Data Flow](#data-flow)
- [Node Types](#node-types)
- [Message Protocol](#message-protocol)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Development](#development)
- [Testing](#testing)
- [Tech Stack](#tech-stack)

---

## Overview

Jenkins Node Editor renders a `Jenkinsfile` as a **live, editable node graph** powered by [React Flow](https://reactflow.dev/). Changes made in the graph are immediately reflected in the source file, and changes made in the text editor instantly update the graph — a true **bidirectional sync**.

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code Window                           │
│                                                                 │
│  ┌─────────────────────────┐   ┌───────────────────────────┐   │
│  │   Text Editor (classic) │◄──►  Jenkins Node Editor       │   │
│  │                         │   │  (Custom Editor Webview)   │   │
│  │  pipeline {             │   │                            │   │
│  │    agent any            │   │  ┌─────┐  ┌───────┐       │   │
│  │    stages {             │   │  │Agent│─►│ Build │       │   │
│  │      stage('Build') {   │   │  └─────┘  └───┬───┘       │   │
│  │        ...              │   │               │            │   │
│  │      }                  │   │           ┌───▼───┐        │   │
│  │    }                    │   │           │ Test  │        │   │
│  │  }                      │   │           └───┬───┘        │   │
│  │                         │   │               │            │   │
│  └─────────────────────────┘   │           ┌───▼───┐        │   │
│                                │           │Deploy │        │   │
│                                └───────────┴───────┴────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

| Feature | Description |
|---------|-------------|
| **Visual Graph Editor** | Drag, drop, and connect pipeline nodes visually |
| **Bidirectional Sync** | Edit text → graph updates; edit graph → text updates |
| **Auto-layout** | Dagre-powered automatic node positioning on open |
| **Declarative Parser** | Full support for `pipeline {}`, `stages`, `agent`, `when`, `environment`, `parameters`, `triggers`, `post` |
| **Scripted Fallback** | Basic `node {}` scripted pipeline support |
| **Node Palette** | Drag new nodes from a sidebar palette |
| **Node Inspector** | Select any node to edit its properties in a side panel |
| **Validation** | Local syntax check + optional remote Jenkins API validation |
| **Build Trigger** | Trigger Jenkins builds directly from the editor |
| **Log Streaming** | Real-time build log streaming via progressive text API |
| **Theme Support** | Follows VS Code light / dark / high-contrast themes |
| **Position Memory** | Node positions are persisted in `.vscode/` between sessions |

---

## Architecture

The extension is split into two isolated runtimes that communicate via a typed message bus.

```mermaid
graph TB
    subgraph "Extension Host (Node.js)"
        EXT["extension.ts\nActivate / Commands"]
        EDITOR["JenkinsNodeEditor\nCustomTextEditorProvider"]
        BUS["MessageBus\nTyped pub/sub bridge"]
        PARSER["JenkinsfileParser\nJenkinsfile → GraphModel"]
        GEN["JenkinsfileGenerator\nGraphModel → Jenkinsfile"]
        VALIDATOR["JenkinsValidator\nLocal + Remote validation"]
        CLIENT["JenkinsClient\nREST API: build / logs"]
        POSSTORE["PositionStore\nPersist node positions"]
        LOGGER["logger\nOutput channel"]
    end

    subgraph "Webview (React / Vite)"
        APP["App.tsx\nRoot component"]
        CANVAS["NodeCanvas\nReact Flow container"]
        PALETTE["NodePalette\nDrag source sidebar"]
        INSPECTOR["NodeInspector\nProperty panel"]
        TOOLBAR["Toolbar\nValidate / Run / Abort"]
        LOGPANEL["LogPanel\nBuild log display"]
        STORE["graphStore (Zustand)\nCentral state"]
        BRIDGE["useVSCodeBridge\npostMessage hook"]
        SYNC["useGraphSync\nDebounced sync hook"]
        NODES["Node Components\nStage/Step/Agent/Parallel/Post"]
    end

    subgraph "Shared (no runtime deps)"
        TYPES["shared/types.ts\nAll TypeScript types"]
        MESSAGES["shared/messages.ts\nMessage discriminated unions"]
    end

    EXT --> EDITOR
    EDITOR --> BUS
    EDITOR --> PARSER
    EDITOR --> GEN
    EDITOR --> VALIDATOR
    EDITOR --> CLIENT
    EDITOR --> POSSTORE
    BUS <-->|"postMessage\nonDidReceiveMessage"| BRIDGE
    BRIDGE --> STORE
    STORE --> CANVAS
    STORE --> INSPECTOR
    STORE --> TOOLBAR
    SYNC --> BUS
    CANVAS --> NODES
```

---

## Data Flow

### Opening a Jenkinsfile

```mermaid
sequenceDiagram
    participant VSCode
    participant JNE as JenkinsNodeEditor
    participant Parser
    participant Bus as MessageBus
    participant Store as graphStore
    participant UI as React UI

    VSCode->>JNE: resolveCustomTextEditor(document)
    JNE->>JNE: getWebviewHtml() → inject nonce + CSP
    JNE->>Bus: create MessageBus
    UI->>Bus: READY
    Bus->>JNE: on('READY')
    JNE->>Parser: parse(document.getText())
    Parser->>Parser: tokenizeBlocks()
    Parser->>Parser: parseDeclarative()
    Parser-->>JNE: { graph, errors, mode }
    JNE->>JNE: mergePositions(graph, savedPositions)
    JNE->>Bus: send INIT { graph, theme, config }
    Bus->>Store: dispatch INIT
    Store->>Store: setNodes / setEdges / autoLayout
    Store->>UI: re-render
```

### Editing the Graph → File Sync

```mermaid
sequenceDiagram
    participant User
    participant RF as React Flow
    participant Store as graphStore
    participant Sync as useGraphSync
    participant Bus as MessageBus
    participant JNE as JenkinsNodeEditor
    participant Gen as Generator
    participant Doc as TextDocument

    User->>RF: drag / edit node
    RF->>Store: onNodesChange / onEdgesChange
    Store->>Sync: graph changed (debounced 300ms)
    Sync->>Bus: GRAPH_CHANGED { graph }
    Bus->>JNE: on('GRAPH_CHANGED')
    JNE->>JNE: isSyncing = true
    JNE->>Gen: generate(graph)
    Gen-->>JNE: Jenkinsfile text
    JNE->>Doc: WorkspaceEdit.replace(fullRange, text)
    JNE->>JNE: setTimeout → isSyncing = false
```

### Text Edit → Graph Sync

```mermaid
sequenceDiagram
    participant User
    participant Doc as TextDocument
    participant JNE as JenkinsNodeEditor
    participant Parser
    participant Bus as MessageBus
    participant Store as graphStore

    User->>Doc: type in text editor
    Doc->>JNE: onDidChangeTextDocument
    JNE->>JNE: if isSyncing → skip (anti-loop)
    JNE->>Parser: parse(document.getText())
    Parser-->>JNE: { graph }
    JNE->>JNE: mergePositions(graph, saved)
    JNE->>Bus: send DOC_CHANGED { graph }
    Bus->>Store: dispatch DOC_CHANGED
    Store->>Store: setNodes / setEdges
```

---

## Node Types

The graph model uses 11 distinct node kinds, each rendered by a dedicated React component:

```mermaid
graph LR
    subgraph "Pipeline Structure"
        P([🔵 pipeline]) --> A([🟢 agent])
        P --> S1([🟡 stage: Build])
        P --> S2([🟡 stage: Test])
        P --> S3([🟡 stage: Deploy])
        P --> POST([🔴 post])
    end

    subgraph "Stage Children"
        S1 --> ST1([⚪ step: sh])
        S1 --> ST2([⚪ step: archiveArtifacts])
        S2 --> ST3([⚪ step: sh])
        S2 --> ST4([⚪ step: junit])
    end

    subgraph "Parallel Stage"
        S3 --> PAR([🟣 parallel])
        PAR --> B1([🟡 stage: Branch A])
        PAR --> B2([🟡 stage: Branch B])
    end
```

| Kind | Icon | Description | Key Data Fields |
|------|------|-------------|-----------------|
| `pipeline` | 🔵 | Root container node | `declarative: boolean` |
| `agent` | 🟢 | Execution agent declaration | `type`, `image`, `label`, `filename` |
| `stage` | 🟡 | Named pipeline stage | `name`, `when`, `agent`, `failFast` |
| `step` | ⚪ | Individual build step | `type`, `script`, `message`, `url`, … |
| `parallel` | 🟣 | Parallel execution group | `branches: string[]` |
| `post` | 🔴 | Post-build condition block | `condition` (always/failure/success/…) |
| `environment` | 🔶 | Environment variables block | `variables[]` |
| `options` | 🔷 | Pipeline options | timeout, disableConcurrentBuilds, … |
| `parameters` | 🟤 | Build parameters | `name`, `type`, `defaultValue` |
| `triggers` | ⬛ | Trigger definitions | cron, pollSCM |
| `when` | 🔲 | Conditional execution | `type`, `value`, `name` |

### Supported Step Types

| Step | DSL | Generated Output |
|------|-----|-----------------|
| `sh` | Shell command | `sh 'command'` |
| `echo` | Print message | `echo 'message'` |
| `git` | Git checkout | `git url: '…', branch: '…'` |
| `checkout` | SCM checkout | `checkout scm` |
| `archiveArtifacts` | Archive files | `archiveArtifacts artifacts: '**/*.jar'` |
| `junit` | Test results | `junit '**/surefire-reports/*.xml'` |
| `timeout` | Step timeout | `timeout(time: 10, unit: 'MINUTES')` |
| `retry` | Retry on fail | `retry(3)` |
| `custom` | Any other step | raw Groovy preserved |

### Supported Agent Types

| Type | Description | Example |
|------|-------------|---------|
| `any` | Any available agent | `agent any` |
| `none` | No global agent | `agent none` |
| `label` | Agent with label | `agent { label 'linux' }` |
| `docker` | Docker container | `agent { docker { image 'node:20' } }` |
| `dockerfile` | Build from Dockerfile | `agent { dockerfile { filename 'Dockerfile.ci' } }` |

---

## Message Protocol

Communication between the Extension Host and the Webview uses strongly-typed discriminated unions.

### Extension → Webview

```
┌──────────────────┬────────────────────────────────────────────────┐
│ Message Type     │ Payload                                        │
├──────────────────┼────────────────────────────────────────────────┤
│ INIT             │ { graph: GraphModel, theme, config }           │
│ DOC_CHANGED      │ { graph: GraphModel }                          │
│ VALIDATION_RESULT│ { errors: ValidationError[] }                  │
│ STEP_CATALOG     │ { steps: StepDefinition[] }                    │
│ LOG_LINE         │ { line: string, stream: 'stdout'│'stderr' }    │
│ BUILD_STATUS     │ { status: BuildStatus }                        │
│ THEME_CHANGED    │ { theme: VSCodeTheme }                         │
└──────────────────┴────────────────────────────────────────────────┘
```

### Webview → Extension

```
┌──────────────────┬────────────────────────────────────────────────┐
│ Message Type     │ Payload                                        │
├──────────────────┼────────────────────────────────────────────────┤
│ READY            │ (none) — webview mounted and ready             │
│ GRAPH_CHANGED    │ { graph: GraphModel }                          │
│ VALIDATE_REQUEST │ (none) — trigger validation                    │
│ RUN_BUILD        │ { jobName?, branch?, params? }                 │
│ ABORT_BUILD      │ (none) — stop running build                    │
│ ERROR            │ { message: string, stack? }                    │
└──────────────────┴────────────────────────────────────────────────┘
```

---

## Project Structure

```
NodeCi/
├── 📄 package.json                  # Extension manifest + scripts
├── 📄 tsconfig.json                 # Extension host TypeScript config
├── 📄 tsconfig.webview.json         # Webview TypeScript config
├── 📄 vite.config.ts                # Webview build (Vite)
├── 📄 esbuild.config.js             # Extension build (esbuild)
├── 📄 vitest.config.ts              # Unit test config
│
├── 📁 src/
│   ├── 📁 extension/               # Extension host (Node.js runtime)
│   │   ├── extension.ts            # Activate / deactivate + commands
│   │   ├── JenkinsNodeEditor.ts    # CustomTextEditorProvider (main)
│   │   ├── MessageBus.ts           # Typed pub/sub bridge
│   │   ├── JenkinsValidator.ts     # Local + REST validation
│   │   ├── JenkinsClient.ts        # Jenkins REST API client
│   │   ├── PositionStore.ts        # Persistent node positions
│   │   └── logger.ts               # VS Code output channel
│   │
│   ├── 📁 parser/                  # Jenkinsfile ↔ GraphModel
│   │   ├── JenkinsfileParser.ts    # Jenkinsfile → GraphModel
│   │   ├── JenkinsfileGenerator.ts # GraphModel → Jenkinsfile
│   │   ├── ASTTypes.ts             # AST type re-exports
│   │   └── layout.ts               # Dagre layout (extension-side)
│   │
│   ├── 📁 shared/                  # Zero-dependency shared types
│   │   ├── types.ts               # All domain types
│   │   └── messages.ts            # Message protocol types
│   │
│   └── 📁 webview/                 # React UI (browser runtime)
│       ├── main.tsx               # React entry point
│       ├── App.tsx                # Root component
│       ├── 📁 components/
│       │   ├── NodeCanvas.tsx     # React Flow canvas
│       │   ├── NodePalette.tsx    # Drag-source sidebar
│       │   ├── NodeInspector.tsx  # Property editor panel
│       │   ├── Toolbar.tsx        # Validate / Run / Abort bar
│       │   └── LogPanel.tsx       # Streaming log display
│       ├── 📁 nodes/
│       │   ├── BaseNode.tsx       # Shared node chrome
│       │   ├── StageNode.tsx      # Stage node component
│       │   ├── StepNode.tsx       # Step node component
│       │   ├── AgentNode.tsx      # Agent node component
│       │   ├── ParallelNode.tsx   # Parallel node component
│       │   ├── PostNode.tsx       # Post node component
│       │   └── index.ts           # nodeTypes map
│       ├── 📁 hooks/
│       │   ├── useVSCodeBridge.ts # VS Code postMessage hook
│       │   ├── useGraphSync.ts    # Debounced graph→ext sync
│       │   └── useJenkinsAPI.ts   # Validate / run / abort hooks
│       ├── 📁 store/
│       │   └── graphStore.ts      # Zustand + immer store
│       ├── 📁 utils/
│       │   ├── layout.ts          # Dagre layout (webview-side)
│       │   └── theme.ts           # VS Code theme → CSS vars
│       └── 📁 styles/
│           └── globals.css        # Global CSS + VS Code overrides
│
├── 📁 test/
│   ├── runTests.js                # E2E test runner
│   ├── 📁 fixtures/
│   │   ├── simple.Jenkinsfile     # 3-stage declarative pipeline
│   │   ├── parallel.Jenkinsfile   # Parallel stages example
│   │   └── complex.Jenkinsfile    # Full-featured pipeline
│   └── 📁 suite/
│       └── parser.test.ts        # 19 Vitest unit tests
│
├── 📁 docs/
│   ├── PHASE1.md                  # VS Code foundations
│   ├── PHASE2.md                  # React Flow engine
│   ├── PHASE3.md                  # Parser ↔ Generator
│   ├── PHASE4.md                  # Bidirectional sync
│   ├── PHASE5.md                  # Jenkins API integration
│   └── PHASE6.md                  # Packaging & publish
│
└── 📁 dist/                        # Build output (git-ignored)
    ├── extension.js               # Bundled extension host
    └── 📁 webview/
        ├── main.js               # Bundled React app
        └── main.css              # Bundled styles
```

---

## Installation

### From Source

**Prerequisites:** Node.js ≥ 20, npm ≥ 10, VS Code ≥ 1.85

```bash
# Clone the repository
git clone https://github.com/PlanesZwalker/vscode-jenkins-node-editor.git
cd vscode-jenkins-node-editor

# Install all dependencies
npm install

# Build both extension and webview
npm run build

# Launch in VS Code Extension Development Host (press F5)
# or install the .vsix:
npm run package
code --install-extension vscode-jenkins-node-editor-0.1.0.vsix
```

### From VS Code Marketplace

Search for **"Jenkins Node Editor"** in the Extensions panel (`Ctrl+Shift+X`).

---

## Configuration

Open VS Code Settings (`Ctrl+,`) and search for **Jenkins Node Editor**:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `jenkinsNodeEditor.jenkinsUrl` | string | `""` | Jenkins server URL, e.g. `http://localhost:8080` |
| `jenkinsNodeEditor.jenkinsUser` | string | `""` | Jenkins username for API auth |
| `jenkinsNodeEditor.jenkinsToken` | string | `""` | Jenkins API token (generate at `/me/configure`) |
| `jenkinsNodeEditor.autoLayout` | boolean | `true` | Auto-layout graph when opening a file |
| `jenkinsNodeEditor.syncDelay` | number | `300` | Debounce delay (ms) before syncing graph → text |

### Example `settings.json`

```json
{
  "jenkinsNodeEditor.jenkinsUrl": "http://jenkins.example.com:8080",
  "jenkinsNodeEditor.jenkinsUser": "alice",
  "jenkinsNodeEditor.jenkinsToken": "11abc123def456",
  "jenkinsNodeEditor.autoLayout": true,
  "jenkinsNodeEditor.syncDelay": 300
}
```

> **Security note:** The API token is stored in VS Code's settings file. For production use, consider storing sensitive values in VS Code's secret storage.

---

## Usage

### Opening the Node Editor

1. Open any file named `Jenkinsfile`, `*.jenkinsfile`, or `Jenkinsfile.*`
2. Click the **$(type-hierarchy) Jenkins Node Editor** icon in the editor title bar, **or** right-click → _Open With_ → _Jenkins Node Editor_
3. The graph panel opens beside the text editor

### Editing Nodes

| Action | How |
|--------|-----|
| **Select node** | Click any node |
| **Move node** | Drag the node header |
| **Edit properties** | Select node → Inspector panel (right side) |
| **Add node** | Drag from the Node Palette (left side) |
| **Delete node** | Select + `Delete` key |
| **Connect nodes** | Drag from a node's output handle to another's input |
| **Auto-layout** | Click the layout button in the Toolbar |
| **Zoom** | Scroll wheel / pinch gesture |
| **Pan** | Middle-click drag, or hold `Space` + drag |

### Validating & Running

```
Toolbar: [ Validate ] [ Run Build ] [ Abort ] [ Auto-layout ] [ Zoom Fit ]
```

- **Validate** — runs local syntax validation (always available) + remote Jenkins API validation (requires `jenkinsUrl` to be configured)
- **Run Build** — triggers a Jenkins build for the current pipeline
- **Abort** — stops the current running build
- Validation errors appear as red markers on the affected nodes and in the Problems panel

### Build Logs

When a build is running, the **Log Panel** slides up from the bottom of the webview and streams log lines in real-time using Jenkins' progressive text API.

---

## Development

### Build Scripts

```bash
npm run build         # Build everything (extension + webview)
npm run build:ext     # Build only the extension host via esbuild
npm run build:web     # Build only the webview via Vite
npm run watch         # Watch mode for both (use with F5)
npm run lint          # ESLint
npm run format        # Prettier
npm run test:unit     # Vitest unit tests
npm run test:e2e      # @vscode/test-electron E2E tests
npm run package       # Bundle as .vsix
npm run publish       # Publish to marketplace (requires vsce login)
```

### Debugging with F5

1. Open the workspace in VS Code
2. Press `F5` → launches **Extension Development Host**
3. In the new window, open a `Jenkinsfile`
4. Set breakpoints in `src/extension/` — they work directly in the Extension Host
5. For webview debugging: open _Developer Tools_ in the new window (`Ctrl+Shift+I`) and inspect the webview iframe

### Parser Development

The parser uses a **character-by-character block tokenizer** (`tokenizeBlocks`) — no external parser dependencies. It handles:

- Nested `{ }` blocks tracking brace depth
- String literals (`'`, `"`, `'''`, `"""`) — skip contents
- Line comments (`//`) and block comments (`/* */`)
- Partial/unbalanced input (EOF closes open blocks gracefully)

To test parser changes:

```bash
npm run test:unit -- --reporter=verbose
```

### Adding a New Node Type

1. Add the new `NodeKind` literal to `src/shared/types.ts`
2. Create `src/webview/nodes/MyNewNode.tsx` extending `BaseNode`
3. Register it in `src/webview/nodes/index.ts`
4. Add a palette entry in `src/webview/components/NodePalette.tsx`
5. Handle the kind in `JenkinsfileParser.ts` and `JenkinsfileGenerator.ts`

---

## Testing

### Unit Tests (Vitest)

19 tests covering the parser and generator:

```bash
npm run test:unit
```

```
✓ test/suite/parser.test.ts (19 tests)

  JenkinsfileParser — simple.Jenkinsfile
    ✓ parses without fatal errors
    ✓ detects declarative mode
    ✓ extracts 3 stage nodes (Build, Test, Deploy)
    ✓ stage names match Jenkinsfile
    ✓ extracts agent node (type: any)
    ✓ extracts post nodes
    ✓ all nodes have valid positions after layout
    ✓ edges connect stages in sequence

  JenkinsfileParser — parallel.Jenkinsfile
    ✓ parses without fatal errors
    ✓ detects parallel node
    ✓ parallel branches are present

  JenkinsfileParser — error cases
    ✓ empty string → error
    ✓ unbalanced braces → error
    ✓ partial input → partial graph

  JenkinsfileGenerator
    ✓ output contains 'pipeline' and 'stages'
    ✓ output ends with '}'
    ✓ indentation is divisible by 2
    ✓ round-trip preserves stage count
    ✓ generates agent block correctly

Test Files  1 passed (1)
     Tests  19 passed (19)
  Duration  ~500ms
```

### Test Fixtures

| Fixture | Description |
|---------|-------------|
| `simple.Jenkinsfile` | 3 stages (Build/Test/Deploy), `agent any`, post block |
| `parallel.Jenkinsfile` | Parallel stages, failFast |
| `complex.Jenkinsfile` | Environment vars, parameters, triggers, when conditions, Docker agent |

---

## Tech Stack

```mermaid
graph LR
    subgraph "Extension Host"
        TS["TypeScript 5.x"]
        NODE["Node.js 20"]
        ESBUILD["esbuild 0.20"]
        TS --> NODE
        NODE --> ESBUILD
    end

    subgraph "Webview"
        REACT["React 18"]
        VITE["Vite 5"]
        FLOW["@xyflow/react 12\n(React Flow)"]
        ZUSTAND["Zustand 4\n+ immer"]
        DAGRE["dagre 0.8"]
        REACT --> FLOW
        REACT --> ZUSTAND
        FLOW --> DAGRE
        VITE --> REACT
    end

    subgraph "Testing"
        VITEST["Vitest 1.x\n(unit)"]
        ELECTRON["@vscode/test-electron\n(E2E)"]
    end

    subgraph "Quality"
        ESLINT["ESLint 8"]
        PRETTIER["Prettier 3"]
        TAILWIND["Tailwind CSS 3"]
    end
```

| Layer | Technology | Version | Role |
|-------|-----------|---------|------|
| Extension host | TypeScript | 5.x | Type-safe extension code |
| Extension build | esbuild | 0.20 | Fast CJS bundle for Node.js |
| Webview UI | React | 18 | Component-based UI |
| Webview build | Vite | 5 | Fast ESM webview bundle |
| Node graph | `@xyflow/react` | 12 | Interactive canvas |
| State | Zustand + immer | 4.x | Immutable reactive store |
| Layout | dagre | 0.8.5 | Directed-graph auto-layout |
| Styling | Tailwind CSS | 3.x | Utility-first CSS |
| Unit tests | Vitest | 1.x | Fast test runner |
| E2E tests | `@vscode/test-electron` | 2.x | Real VS Code instance |
| Lint | ESLint | 8 | Code quality |
| Format | Prettier | 3 | Code formatting |

---

## Contributing

1. Fork and clone the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Install dependencies: `npm install`
4. Make your changes and add tests
5. Ensure all tests pass: `npm test`
6. Ensure the build is clean: `npm run build`
7. Format your code: `npm run format`
8. Open a Pull Request

---

## License

Apache 2.0 © 2026 [PlanesZwalker](https://github.com/PlanesZwalker) — see [LICENSE](LICENSE) for details.
