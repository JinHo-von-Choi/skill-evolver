# Contributing to Evolver

Thanks for your interest in contributing to Evolver.

## Prerequisites

- **Node.js** 20+
- **pnpm** 10+ (`corepack enable && corepack prepare pnpm@latest --activate`)
- **TypeScript** 5.8+ (installed as a dev dependency)

## Setup

```bash
git clone https://github.com/nerdvana-kr/evolver.git
cd evolver
pnpm install
pnpm build
```

## Project Structure

```
packages/
  core/              # EvolutionLoop, ParetoFrontier, types
  proposer/          # FailureAnalyzer, LlmProposer
  skill-builder/     # SkillMaterializer, MetaSkill
  adapter-claude-code/  # Claude Code executor
  adapter-cursor/    # Cursor IDE executor
  adapter-codex/     # OpenAI Codex executor
  plugin-memento/    # memento-mcp integration
  cli/               # CLI entry point
examples/            # Example task sets
```

## Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific package
cd packages/core
pnpm test

# Build all packages
pnpm build
```

## Code Style

- TypeScript strict mode (`strict: true` in tsconfig)
- ESM only (`"type": "module"` in package.json)
- No `var` declarations -- use `const` or `let`
- Vertical alignment for assignments where it improves readability
- Block comments (`/** ... */`) for function documentation

## Adding an Adapter

Adapters connect Evolver to different LLM coding agents.

1. Create a new package: `packages/adapter-<name>/`
2. Implement `Executor` interface from `@evolver/core`:
   ```typescript
   import { Executor, ExecutionResult, SkillProgram, Task } from "@evolver/core";

   export class MyExecutor implements Executor {
     async execute(tasks: Task[], program: SkillProgram): Promise<ExecutionResult> {
       // Run tasks with the target agent, collect results
     }
   }
   ```
3. Add a `SkillConverter` if the target uses a different skill format (e.g. `.cursorrules`, `AGENTS.md`)
4. Export both from `src/index.ts`
5. Add the package to `pnpm-workspace.yaml` (automatic if under `packages/`)
6. Add tests in `src/__tests__/`
7. Build and verify: `pnpm build && pnpm test`

## Adding a Plugin

Plugins extend the evolution loop with side effects (memory, logging, metrics).

1. Create a new package: `packages/plugin-<name>/`
2. Implement the `Plugin` interface from `@evolver/core`:
   ```typescript
   import { Plugin, EvolutionEvent } from "@evolver/core";

   export class MyPlugin implements Plugin {
     name = "my-plugin";

     async onEvent(event: EvolutionEvent): Promise<void> {
       // React to evolution events
     }
   }
   ```
3. Export from `src/index.ts`
4. Add tests in `src/__tests__/`
5. Document configuration in the package README

## PR Process

1. Fork the repository and create a feature branch from `master`
2. Make your changes with tests
3. Ensure all checks pass: `pnpm build && pnpm test`
4. Write a clear commit message following [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat(core): add new scoring strategy`
   - `fix(cli): handle missing task file gracefully`
   - `docs: update adapter guide`
5. Open a pull request with a description of what and why
6. Address review feedback

## Questions?

Open an issue on the repository if you have questions or want to discuss a feature before implementing it.
