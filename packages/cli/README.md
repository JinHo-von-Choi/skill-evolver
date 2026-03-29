# @evolver/cli

> Command-line interface for the Evolver skill evolution framework.

## Installation

```bash
pnpm add -g @evolver/cli
```

## Usage

### `evolver evolve` -- Run the evolution loop

```bash
evolver evolve \
  --task-dir ./tasks \
  --adapter claude-code \
  --max-iterations 10 \
  --frontier-capacity 3 \
  --budget-limit 5.0
```

### `evolver status` -- Show last run status

```bash
evolver status
```

Reads `.evolver/state.json` and prints last run timestamp, iterations, cost, best program score, frontier size, and discovered skills.

### `evolver skills list` -- List discovered skills

```bash
evolver skills list --skills-dir ./skills
```

### `evolver skills export` -- Export skills to another format

```bash
evolver skills export --format cursor --output .cursorrules
```

### `evolver skills test` -- Cross-model transfer test

```bash
evolver skills test \
  --cross-model \
  --task-dir ./tasks \
  --source claude-code \
  --target cursor,codex
```

## API

### Commands

| Command | Description |
|---------|-------------|
| `evolve` | Run the skill evolution loop |
| `status` | Show current evolution status from `.evolver/state.json` |
| `skills list` | List discovered skills in the skills directory |
| `skills export` | Export skills to another agent format (e.g. Cursor `.cursorrules`) |
| `skills test` | Run cross-model skill transfer tests |

### Modules

#### `loadConfig(taskDir: string): TaskConfig`

Parses `config.yaml` from the task directory.

#### `loadTasks(taskDir: string, subDir: string, defaultScorer?: ScorerType): Task[]`

Loads YAML task files from `{taskDir}/{subDir}/` into `Task[]` arrays.

#### `saveState(state: EvolverState): void` / `loadState(): EvolverState | null`

Persists/loads evolution state to/from `.evolver/state.json`.

## Configuration

### `evolve` command options

| Option | Default | Description |
|--------|---------|-------------|
| `--task-dir <path>` | (required) | Path to tasks directory |
| `--skills-dir <path>` | `./skills` | Output skills directory |
| `--adapter <name>` | `claude-code` | Executor adapter (`claude-code`, `cursor`, `codex`) |
| `--proposer-model <model>` | `claude-sonnet-4-6` | Model for proposal generation |
| `--builder-model <model>` | `claude-haiku-4-5` | Model for skill materialization |
| `--runs <n>` | `3` | Runs per evaluation |
| `--budget-limit <usd>` | none | Maximum budget in USD |
| `--frontier-capacity <n>` | `3` | Pareto frontier capacity |
| `--max-iterations <n>` | `10` | Maximum evolution iterations |
| `--failure-threshold <n>` | `0.5` | Score threshold for failure |
| `--plugin <name>` | none | Plugin to load (e.g. `memento`) |
| `--memento-url <url>` | none | Memento MCP server URL |
| `--memento-key <key>` | none | Memento MCP access key |

### Task directory structure

```
tasks/
  config.yaml          # Optional: default scorer, categories
  train/
    task-001.yaml      # { id, input, expected, category?, scorer? }
    task-002.yaml
  validation/
    task-010.yaml
```

## Testing

```bash
pnpm test
```
