# Changelog

All notable changes to the **Jenkins Node Editor** extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.0] — 2026-10-03

### Added
- **Raw construct support.** `script { … }`, multi-line `sh '''…'''` / `sh """…"""`
  heredocs, `checkout([…])` and `withCredentials([…])` — constructs the graph model
  cannot decompose — are now real step nodes holding their **exact source text**
  (`rawContent`). They are editable in the inspector ("Source (preserved verbatim)")
  and re-emitted byte-for-byte, so editing a pipeline no longer reformats or drops them.
- **Lossless surroundings.** Everything outside `pipeline { }` (top-level Groovy
  helpers, constants, `@Library`) is captured as `meta.preamble` / `meta.epilogue`
  and re-attached on generation — a regeneration can no longer delete helper code.
- New `test/fixtures/raw-steps.Jenkinsfile` + `stepParser` / `raw-steps` /
  `real-constructs` test suites.

### Fixed
- **Multi-line steps were silently dropped.** The step scanner was line-based, so a
  `checkout([…])` or `sh '''…'''` spanning several lines was cut at the first line and
  lost. It now accumulates a statement across lines while inside `()`/`[]`/strings.
- **Statements before a child block were lost.** The block tokenizer only kept the
  trailing body segment, so anything written before a `script { … }` disappeared;
  the full body is now kept and child blocks are masked out.
- **Step order** is preserved (plain steps and child blocks merged by source offset).
- **Nested `steps { }` after a nested `stages { }`** were skipped (the `else if`
  chain); each branch is now evaluated independently.
- `simple.Jenkinsfile` no-op regeneration is byte-identical again (epilogue newline).
- Destructive-edit guard threshold tightened 0.5 → 0.35.

## [0.7.0] — 2026-10-03

### Added
- **E2E harness**: `test/suite/index.js` (mocha) runs `test/suite/**/*.e2e.js` inside a
  real VS Code via `@vscode/test-electron`; wired as a real CI gate.
- `untrustedWorkspaces: limited` declared in the manifest.
- **Build parameters** form: the `parameters {}` block is rendered (text /
  `booleanParam` / `choice`); values are sent with **Run Build**.
- `jenkinsBranch` setting (multibranch) and a **Test connection** probe
  (server reachable → authenticated → job found).
- Step-type selector now offers real step names from the Jenkins step catalogue.

### Fixed
- The `autoLayout` setting is honoured (saved positions always win); the `syncDelay`
  setting is applied by the webview (was hard-coded to 300 ms).
- `RUN_BUILD` / `ABORT_BUILD` re-read the live config (a panel-saved setting was ignored).

## [0.6.0] — 2026-10-03

### Added
- **Test connection** button in the configuration panel: probes *server reachable →
  authenticated → job found* and shows a per-step ✓/✕ report before you trigger a build.
  Works on unsaved panel values (drafts are tested as-is).
- `JenkinsClient.testConnection()` with auth overrides.

### Fixed
- `RUN_BUILD` / `ABORT_BUILD` used a configuration snapshot taken when the panel
  opened, so settings saved in the panel were ignored. They now re-read the live config.

## [0.5.0] — 2026-10-03

### Added
- `jenkinsBranch` setting (and a **Branch** field in the panel) for multibranch jobs —
  appended to the job path (`glsl` + `dev` → `glsl/job/dev`), without duplicating a
  branch already present in the path.
- **Build parameters** form: the `parameters {}` block of the Jenkinsfile is parsed and
  rendered (text / `booleanParam` / `choice`); values are sent with **Run Build**.

### Fixed
- `parseParameters` now handles unquoted booleans/numbers (`defaultValue: false`),
  empty strings, multi-line descriptions and `choices: [...]` (balanced-paren scan).

## [0.4.0] — 2026-10-03

### Added
- **Guided setup**: if *Run Build* fails because Jenkins isn't configured, a
  configuration panel opens automatically (URL / user / job / branch / token).
- Settings protocol (`CONFIG`, `CONFIG_REQUIRED`, `SET_CONFIG`) — the token is written
  to VS Code's encrypted **SecretStorage**, never to `settings.json`.

### Fixed
- A build that could not start no longer leaves the UI stuck on *running*: every
  `RUN_BUILD` / `ABORT_BUILD` path now ends with a terminal status.

## [0.3.0] — 2026-10-03

### Added
- **Scripted pipelines**: stages *and* steps are parsed and generated (recursion into
  `if` / `timestamps` blocks).
- Nested `when` conditions (`anyOf` / `allOf` / `not`) are parsed *and* rewritten.
- Validation errors are mapped to their node (by stage name / line) so inline markers show.
- Command-palette `validate` / `generate` commands now work (previously empty stubs).

## [0.2.0] — 2026-10-03

### Added
- **Surgical sync**: graph edits are applied as minimal range-based edits instead of
  regenerating the whole file, with a destructive-edit guard (refuses >50% removal).
- `PARSE_ERRORS` protocol — parse failures are no longer silent.
- Jenkins step catalogue fetch; keybindings; `.map` files excluded from the VSIX.

### Fixed
- Parser: tokenizer-based mode detection (leading comments/constants), nested `stages`
  recursion, greedy keyword extraction (stage names with parentheses).
- Layout: `contains` edges fed to dagre (steps/agent/post were collapsing to y≈0).
- Generator fidelity: no blank lines, source-order `post`, conditional `fingerprint`,
  EOL normalisation (CRLF ↔ LF).

## [0.1.0]

- Initial release: Blue Ocean–styled visual node editor for Jenkinsfile pipelines,
  bidirectional sync, node palette, inspector, validation, build trigger, log panel.
