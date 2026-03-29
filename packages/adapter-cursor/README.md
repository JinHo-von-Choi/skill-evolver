# @evolver/adapter-cursor

> Cursor IDE CLI executor adapter for the Evolver framework.

## Installation

```bash
pnpm add @evolver/adapter-cursor
```

## Usage

```typescript
import { CursorExecutor, SkillConverter } from "@evolver/adapter-cursor";
import type { CursorRulesOutput } from "@evolver/adapter-cursor";

const executor = new CursorExecutor({
  name:        "cursor",
  command:     "cursor",
  skillsPath:  "./skills",
  skillFormat: "markdown",
  timeout:     60_000,
  concurrency: 2,
});

// Execute tasks (implements @evolver/core Executor interface)
const results = await executor.run(program, tasks);

// Convert a single skill to Cursor format
const output: CursorRulesOutput = SkillConverter.toCursorRules(skill);
// output.cursorrules -> .cursorrules file content
// output.rules       -> { "skill-name.md": content }

// Merge multiple skills into one .cursorrules
const merged = SkillConverter.mergeCursorRules(skills);
```

## API

### `CursorExecutor`

Executes tasks via the Cursor CLI (`--cli --output-format json`). Converts skills to `.cursorrules` + `rules/*.md` format, deploys to a temp directory, and runs tasks with configurable concurrency.

```typescript
new CursorExecutor(config: AdapterConfig)
executor.run(program: Program, tasks: Task[]): Promise<ExecutionResult[]>
```

Security: uses `execFile` (no shell invocation) to prevent injection.

Built-in scorers: `exact-match` (default) and `fuzzy`.

### `SkillConverter`

Converts SKILL.md format to Cursor's `.cursorrules` + `rules/` directory structure.

```typescript
SkillConverter.toCursorRules(skill: Skill): CursorRulesOutput
SkillConverter.mergeCursorRules(skills: Skill[]): string
SkillConverter.buildRulesMap(skills: Skill[]): Record<string, string>
```

### `CursorRulesOutput`

```typescript
interface CursorRulesOutput {
  cursorrules: string;              // .cursorrules file content
  rules:       Record<string, string>; // rules/ directory files
}
```

## Configuration

Uses `AdapterConfig` from `@evolver/core`:

| Option | Type | Description |
|--------|------|-------------|
| `name` | `string` | Adapter identifier |
| `command` | `string` | CLI command (e.g. `"cursor"`) |
| `skillsPath` | `string` | Path to skills directory |
| `skillFormat` | `"markdown" \| "json" \| "yaml"` | Skill file format |
| `timeout` | `number` | Per-task timeout in milliseconds |
| `concurrency` | `number` | Max parallel task executions |

## Testing

```bash
pnpm test
```
