# @evolver/adapter-claude-code

> Claude Code CLI executor adapter for the Evolver framework.

## Installation

```bash
pnpm add @evolver/adapter-claude-code
```

## Usage

```typescript
import { ClaudeCodeExecutor, ResultParser } from "@evolver/adapter-claude-code";

const executor = new ClaudeCodeExecutor({
  name:        "claude-code",
  command:     "claude",
  skillsPath:  "./skills",
  skillFormat: "markdown",
  timeout:     60_000,
  concurrency: 2,
});

// Execute a program against tasks (implements @evolver/core Executor interface)
const results = await executor.run(program, tasks);
```

## API

### `ClaudeCodeExecutor`

Executes tasks via the Claude Code CLI (`--print --output-format json --skill-path`). Deploys skills as `.md` files to a temp directory, runs tasks in batches with configurable concurrency, and scores results.

```typescript
new ClaudeCodeExecutor(config: AdapterConfig)
executor.run(program: Program, tasks: Task[]): Promise<ExecutionResult[]>
```

Security: uses `execFile` (no shell invocation) to prevent injection. All arguments are passed as arrays.

Built-in scorers: `exact-match` (default) and `fuzzy`.

### `ResultParser`

Static parser for Claude Code CLI stdout/stderr output.

```typescript
ResultParser.parse(taskId: string, stdout: string, stderr: string, durationMs: number): ExecutionResult
```

Handles JSON and raw text output. Extracts `tokenUsage` and promotes `result` field when present in JSON responses.

## Configuration

Uses `AdapterConfig` from `@evolver/core`:

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string` | Adapter identifier |
| `command` | `string` | CLI command (e.g. `"claude"`) |
| `skillsPath` | `string` | Path to skills directory |
| `skillFormat` | `"markdown" \| "json" \| "yaml"` | Skill file format |
| `timeout` | `number` | Per-task timeout in milliseconds |
| `concurrency` | `number` | Max parallel task executions |

## Testing

```bash
pnpm test
```
