# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
