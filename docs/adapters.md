# Adapters

Adapters bridge the evolution loop with specific LLM agent runtimes. Each adapter implements the `Executor` interface from `@evolver/core` and handles skill deployment, task execution, result parsing, and scoring.

## Executor Interface

Every adapter must implement:

```typescript
import type { Executor, Program, Task, ExecutionResult } from "@evolver/core";

class MyAdapter implements Executor {
  async run(program: Program, tasks: Task[]): Promise<ExecutionResult[]>;
}
```

**`run()` responsibilities:**

1. Deploy `program.skills` to the agent's skill directory in the correct format.
2. Execute each task via the agent's CLI or API.
3. Parse the agent's output into `ExecutionResult` objects.
4. Score each result against `task.expected` using the task's scorer.

**`ExecutionResult` shape:**

```typescript
interface ExecutionResult {
  taskId:      string;
  output:      unknown;
  score:       number;        // 0..1
  error?:      string;
  tokenUsage?: { input: number; output: number };
  durationMs:  number;
}
```

## Built-in Adapters

### Claude Code (`claude-code`)

**Package:** `@evolver/adapter-claude-code`

The default adapter. Skills are deployed as individual `.md` files and tasks are executed via the `claude` CLI.

**Skill format:** Each skill becomes a `{skill-name}.md` file in a temporary skills directory.

**CLI invocation:**

```bash
claude --print --output-format json --skill-path <skillDir> "<prompt>"
```

**Result parsing:** `ResultParser` handles JSON and raw text output, extracts `tokenUsage` from the response `usage` field, and promotes the `result` field if present.

**Usage:**

```bash
evolver evolve --adapter claude-code --task-dir ./tasks
```

### Cursor (`cursor`)

**Package:** `@evolver/adapter-cursor`

Converts skills into Cursor IDE's rule format and executes tasks via the Cursor CLI.

**Skill format:** Two artifacts are generated:
- `.cursorrules` -- a merged file with section headers referencing each skill
- `rules/{skill-name}.md` -- individual rule files containing the skill content

The `SkillConverter` class provides:
- `toCursorRules(skill)` -- single skill to `.cursorrules` + `rules/` pair
- `mergeCursorRules(skills)` -- merge multiple skills into one `.cursorrules`
- `buildRulesMap(skills)` -- generate the `rules/` file map

**CLI invocation:**

```bash
cursor --cli --output-format json "<prompt>"
```

The working directory is set to the temporary directory containing `.cursorrules` and `rules/`.

**Usage:**

```bash
evolver evolve --adapter cursor --task-dir ./tasks
```

### Codex (`codex`)

**Package:** `@evolver/adapter-codex`

Converts skills into OpenAI Codex CLI's `AGENTS.md` format.

**Skill format:** All skills are merged into a single `AGENTS.md` file. Each skill becomes an `## {skill-name}` section with its trigger and content.

The `SkillConverter` class provides:
- `toAgentsMd(skill)` -- single skill to an AGENTS.md section string
- `mergeAgentsMd(skills)` -- merge all skills into a complete `AGENTS.md` document

**CLI invocation:**

```bash
codex --quiet --approval-mode full-auto "<prompt>"
```

**Usage:**

```bash
evolver evolve --adapter codex --task-dir ./tasks
```

## Skill Format Comparison

| Aspect | Claude Code | Cursor | Codex |
|--------|-------------|--------|-------|
| Skill file | `{name}.md` | `rules/{name}.md` | `AGENTS.md` (merged) |
| Config file | none | `.cursorrules` | none |
| Format | SKILL.md with YAML frontmatter | Markdown rule | Markdown section under `##` |
| Deployment | One file per skill in `--skill-path` | `.cursorrules` + `rules/` in working dir | Single `AGENTS.md` in working dir |
| CLI flag | `--skill-path <dir>` | `--cli` (uses cwd) | `--quiet --approval-mode full-auto` |

## Scoring

All built-in adapters share the same scorer implementations:

| Scorer | Behavior |
|--------|----------|
| `exact-match` | `1` if `output === expected` (deep JSON comparison), else `0` |
| `fuzzy` | `1` for exact match, `0.5` if one string contains the other (case-insensitive), else `0` |

The scorer is selected per-task: the task's `scorer` field overrides the `config.yaml` default. `llm-judge` and `custom` scorers are extension points.

## Concurrency and Timeouts

Each adapter respects the `AdapterConfig`:

```typescript
interface AdapterConfig {
  name:        string;        // adapter name
  command:     string;        // CLI command to run
  skillsPath:  string;        // default skills output directory
  skillFormat: "markdown" | "json" | "yaml";
  timeout:     number;        // per-task timeout in ms
  concurrency: number;        // max parallel task invocations
}
```

Tasks are run in batches of `concurrency` size using `Promise.all`. If a task exceeds the `timeout`, the process is killed and the result is recorded with a `TIMEOUT` error.

## Security

All adapters use `node:child_process` `execFile` (not shell-based alternatives) to prevent command injection. Arguments are always passed as arrays, never interpolated into a shell string.

Temporary working directories are created per `run()` call with `randomUUID()` names and cleaned up in a `finally` block.

## Writing a Custom Adapter

### Step 1: Create the package

```bash
mkdir -p packages/adapter-myagent/src
```

### Step 2: Implement the Executor interface

Create a class that implements `Executor` from `@evolver/core`. Your implementation should:

1. Deploy `program.skills` in your agent's expected format (write files to a temp directory).
2. Invoke your agent's CLI using `execFile` from `node:child_process` (for shell injection safety).
3. Parse the CLI output into `ExecutionResult` objects.
4. Score each result using the task's scorer.
5. Clean up the temp directory in a `finally` block.

See the existing adapters (`adapter-claude-code`, `adapter-cursor`, `adapter-codex`) for reference implementations.

### Step 3: Register in the CLI

Add a resolution branch in `packages/cli/src/commands/evolve.ts`:

```typescript
if (name === "myagent") {
  const mod = await import("@evolver/adapter-myagent");
  return new mod.MyExecutor();
}
```

### Step 4: Add to the workspace

Add the package to `pnpm-workspace.yaml` and create a `package.json` with `@evolver/core` as a dependency.

```bash
pnpm install
pnpm build
```

Test with:

```bash
npx evolver evolve --adapter myagent --task-dir ./tasks
```
