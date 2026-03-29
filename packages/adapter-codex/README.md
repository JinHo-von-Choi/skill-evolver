# @evolver/adapter-codex

> OpenAI Codex CLI executor adapter for the Evolver framework.

## Installation

```bash
pnpm add @evolver/adapter-codex
```

## Usage

```typescript
import { CodexExecutor, SkillConverter } from "@evolver/adapter-codex";

const executor = new CodexExecutor({
  name:        "codex",
  command:     "codex",
  skillsPath:  "./skills",
  skillFormat: "markdown",
  timeout:     60_000,
  concurrency: 2,
});

// Execute tasks (implements @evolver/core Executor interface)
const results = await executor.run(program, tasks);

// Convert skills to AGENTS.md format
const agentsMd = SkillConverter.mergeAgentsMd(skills);
```

## API

### `CodexExecutor`

Executes tasks via the Codex CLI (`--quiet --approval-mode full-auto`). Converts skills to a single `AGENTS.md` file, deploys to a temp directory, and runs tasks with configurable concurrency.

```typescript
new CodexExecutor(config: AdapterConfig)
executor.run(program: Program, tasks: Task[]): Promise<ExecutionResult[]>
```

Security: uses `execFile` (no shell invocation) to prevent injection.

Built-in scorers: `exact-match` (default) and `fuzzy`.

### `SkillConverter`

Converts SKILL.md format to Codex's `AGENTS.md` format. Each skill becomes a `## heading` section.

```typescript
SkillConverter.toAgentsMd(skill: Skill): string
SkillConverter.mergeAgentsMd(skills: Skill[]): string
```

## Configuration

Uses `AdapterConfig` from `@evolver/core`:

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string` | Adapter identifier |
| `command` | `string` | CLI command (e.g. `"codex"`) |
| `skillsPath` | `string` | Path to skills directory |
| `skillFormat` | `"markdown" \| "json" \| "yaml"` | Skill file format |
| `timeout` | `number` | Per-task timeout in milliseconds |
| `concurrency` | `number` | Max parallel task executions |

## Testing

```bash
pnpm test
```
