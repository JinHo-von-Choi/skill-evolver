# Evolver

Failure-driven skill evolution framework for LLM agents.

Based on the EvoSkill architecture (arXiv:2603.02766), Evolver automatically discovers and refines agent skills by analyzing execution failures. It supplements the original paper with statistical rigor (multi-run), cost tracking, skill conflict detection, and an optional long-term memory plugin.

## Quick Start

```bash
# Install
git clone <repo-url> && cd evolver
pnpm install
pnpm build

# Run evolution
evolver evolve \
  --task-dir ./examples/claude-code/tasks \
  --skills-dir ./skills \
  --adapter claude-code \
  --proposer-model claude-sonnet-4-6 \
  --builder-model claude-haiku-4-5 \
  --runs 3 \
  --budget-limit 10
```

## Architecture

```
TaskSet (input)
  |
  v
EvolutionLoop (core)
  |
  +-- 1. parentSelection()        ParetoFrontier (round-robin)
  |
  +-- 2. executor.run()           Adapter executes tasks
  |      failure collection       score < threshold -> FailureSet
  |      [plugin] onFailure       recall past similar failures
  |
  +-- 3. proposer.propose()       LLM analyzes failures -> SkillProposal
  |      [plugin] onProposal      recall similar skill history
  |
  +-- 4. skillBuilder.build()     Materialize SKILL.md + scripts/
  |      ConflictDetector.check   trigger overlap detection
  |
  +-- 5. executor.run()           Validate candidate on held-out set
  |      CostTracker.record       token/cost accounting
  |
  +-- 6. frontier.update()        Accept/reject candidate
  |      [plugin] onEvaluation    persist skill performance
  |
  +-- 7. history.log()            Deduplicated feedback history
  |
  +-- budgetLimit exceeded?       Early termination
  |
  v
Best Program + EvolutionReport
```

## CLI

```bash
evolver evolve [options]       # Run evolution loop
evolver status                 # Current frontier, cost, iteration
evolver skills list            # Discovered skills
evolver skills test            # Validate skills against task set
evolver skills export          # Export skills to agent format
```

### evolve options

| Flag | Default | Description |
|------|---------|-------------|
| `--task-dir` | required | Path to task directory (config.yaml + train/ + validation/) |
| `--skills-dir` | `./skills` | Output directory for discovered skills |
| `--adapter` | `claude-code` | Executor adapter name |
| `--proposer-model` | `claude-sonnet-4-6` | LLM model for failure analysis |
| `--builder-model` | `claude-haiku-4-5` | LLM model for skill materialization |
| `--runs` | `3` | Number of independent runs (statistical rigor) |
| `--budget-limit` | none | Maximum USD spend before early termination |
| `--frontier-capacity` | `3` | Pareto frontier size |
| `--max-skills` | `20` | Maximum skills per program |

## Adapter Extension

Implement the `Executor` interface to support a new agent:

```typescript
import type { Executor, Program, Task, ExecutionResult } from "@evolver/core";

class MyAdapter implements Executor {
  async run(program: Program, tasks: Task[]): Promise<ExecutionResult[]> {
    // 1. Deploy program.skills to agent's skill directory
    // 2. Execute each task via agent CLI/API
    // 3. Parse output -> ExecutionResult
    // 4. Score with task.scorer
  }
}
```

Planned adapters (v0.2+):
- `adapter-cursor` -- .cursorrules + rules/ format
- `adapter-codex` -- AGENTS.md format
- `adapter-copilot` -- .github/copilot-instructions.md format

## Plugin System

Plugins hook into the evolution loop lifecycle:

```typescript
import type { Plugin } from "@evolver/core";

const myPlugin: Plugin = {
  name: "my-plugin",
  hooks: {
    async onFailure(failures)    { /* recall context */ },
    async onProposal(proposal)   { /* enrich proposal */ },
    async onEvaluation(result)   { /* persist outcome */ },
    async onFrontierUpdate(front){ /* snapshot state  */ },
  },
};
```

Built-in plugin: `@evolver/plugin-memento` (v0.2) connects to memento-mcp for long-term semantic memory across evolution sessions.

## Package Structure

```
evolver/
  packages/
    core/                  @evolver/core           Evolution engine
    cli/                   @evolver/cli            CLI entry point
    proposer/              @evolver/proposer        LLM failure analysis
    skill-builder/         @evolver/skill-builder   Skill materialization
    adapter-claude-code/   @evolver/adapter-claude-code  Claude Code adapter
  examples/
    claude-code/           Example task set
```

## Task Directory Format

```
tasks/
  config.yaml            # scorer, categories
  train/
    task-001.yaml        # { id, input, expected, category? }
    task-002.yaml
  validation/
    task-010.yaml
```

## EvoSkill Improvements

| EvoSkill limitation | Evolver solution |
|---------------------|------------------|
| Single run, no statistics | `--runs N` with mean/stddev/CI report |
| No cost analysis | CostTracker: per-iteration token/cost, `--budget-limit` |
| Skill conflicts ignored | ConflictDetector: trigger overlap detection, `--max-skills` |
| Single model only | Separate `--proposer-model` / `--builder-model` |
| k=3 unjustified | Manual `--frontier-capacity`, auto-tuning in v0.2 |

## References

- EvoSkill: arXiv:2603.02766
- TypeScript, Node.js 20+, pnpm workspace, turborepo, vitest

## License

MIT
