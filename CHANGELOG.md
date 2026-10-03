# Changelog

All notable changes to the **Jenkins Node Editor** extension are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
