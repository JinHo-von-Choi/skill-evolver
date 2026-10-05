# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Claude Code adapter now deploys skills as a real plugin (`.claude-plugin/plugin.json`, `skills/<name>/SKILL.md`, bundled scripts) and passes the plugin root to `--plugin-dir`. The previous layout (a folder of `<name>.md` files) was not recognized by `claude` as a plugin, so skills were never loaded during evaluation. SKILL.md frontmatter is completed with `name` and `description` when missing.
- `evolver --version` reports the package version instead of a hardcoded `0.1.0`.
- Authentication, permission, and endpoint errors from the proposer or builder now stop the loop immediately instead of being skipped for every remaining iteration; other errors stop it after 3 consecutive failures (`maxConsecutiveLlmFailures`). The report carries `abortReason` and the CLI exits non-zero.

### Added (follow-up)

- `--concurrency`, `--timeout`, and `--api-base-url` flags; `ANTHROPIC_AUTH_TOKEN` is accepted in place of `ANTHROPIC_API_KEY`
- Offline smoke test that checks a deployed plugin is loaded by the real `claude` CLI (skipped when `claude` is not installed)

### Added

- Multi-run statistics: `Program.scoreStats` and the report now carry mean, sample standard deviation, and 95% confidence interval (`summarize`, `isSignificantImprovement` in core)
- Hold-out evaluation: optional `holdout/` task directory, reported as `EvolutionReport.holdout`
- `--adaptive-frontier`, `--frontier-min`, `--frontier-max`, `--selection tournament`, `--acceptance-margin`, `--executor-model` flags
- Per-model pricing table (`estimateCostUsd`) and `drainUsage()` on `Proposer` / `SkillBuilder`; proposer and builder spend now counts toward `--budget-limit`
- GitHub Actions workflow running build and test

### Changed

- Candidates are accepted only when they significantly beat their parent, instead of being admitted unconditionally while the frontier has free slots
- `edit` proposals replace the `editTarget` skill in place (the builder now receives its current content) rather than appending a duplicate
- Token usage from every run is billed, not only the last run of a multi-run evaluation
- Budget is checked after training, proposal, build, and validation stages
- A proposer or builder error skips the iteration instead of aborting the loop
- `AdaptiveFrontier` is now wired into `EvolutionLoop`; `tournament` selection is implemented

## [0.2.0] - 2026-03-30

### Added

- `@evolver/adapter-cursor`: Cursor IDE adapter (`.cursorrules` skill conversion)
- `@evolver/adapter-codex`: OpenAI Codex CLI adapter (`AGENTS.md` skill conversion)
- `@evolver/plugin-memento`: memento-mcp memory integration (MementoPlugin + MementoClient)
- `CrossModelTester`: skill transfer validation across models via `evolver skills test --cross-model`
- `AdaptiveFrontier`: automatic Pareto frontier capacity (`k`) adjustment based on iteration progress
- README overhaul with full CLI reference, architecture diagrams, and guides

## [0.1.0] - 2026-03-30

### Added

- `@evolver/core`: EvolutionLoop, ParetoFrontier, FeedbackHistory, CostTracker, ConflictDetector
- `@evolver/proposer`: FailureAnalyzer, LlmProposer
- `@evolver/skill-builder`: SkillMaterializer, MetaSkill
- `@evolver/adapter-claude-code`: ClaudeCodeExecutor, ResultParser
- `@evolver/cli`: `evolve`, `status`, `skills` commands with YAML/JSON task loader
- Type definitions and package initialization (`types.ts`)
- Example task set for Claude Code
- Monorepo scaffolding (pnpm workspaces + Turborepo + TypeScript strict)

[0.2.0]: https://github.com/nerdvana-kr/evolver/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/nerdvana-kr/evolver/releases/tag/v0.1.0
