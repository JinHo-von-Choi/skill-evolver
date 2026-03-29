# CLI Reference

Evolver provides a command-line interface built with [commander](https://www.npmjs.com/package/commander). All commands are available via `npx evolver` (or `evolver` if installed globally).

```bash
npx evolver --help
npx evolver --version
```

## `evolver evolve`

Run the skill evolution loop.

```bash
npx evolver evolve --task-dir ./tasks [options]
```

### Options

| Flag | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `--task-dir <path>` | string | -- | yes | Path to task directory containing `config.yaml`, `train/`, `validation/` |
| `--skills-dir <path>` | string | `./skills` | no | Output directory for discovered skills |
| `--adapter <name>` | string | `claude-code` | no | Executor adapter: `claude-code`, `cursor`, `codex` |
| `--proposer-model <model>` | string | `claude-sonnet-4-6` | no | LLM model for failure analysis and skill proposal |
| `--builder-model <model>` | string | `claude-haiku-4-5` | no | LLM model for skill materialization |
| `--runs <n>` | number | `3` | no | Independent runs per evaluation (statistical rigor) |
| `--budget-limit <usd>` | number | none | no | Maximum USD spend before early termination |
| `--frontier-capacity <n>` | number | `3` | no | Pareto frontier size (number of top programs to keep) |
| `--max-iterations <n>` | number | `10` | no | Maximum evolution iterations |
| `--failure-threshold <n>` | number | `0.5` | no | Score below this is treated as failure for proposal generation |
| `--plugin <name>` | string | none | no | Plugin to load (currently: `memento`) |
| `--memento-url <url>` | string | none | no | Memento MCP server URL (required with `--plugin memento`) |
| `--memento-key <key>` | string | none | no | Memento MCP access key (required with `--plugin memento`) |

### Example

```bash
npx evolver evolve \
  --task-dir ./examples/claude-code/tasks \
  --adapter claude-code \
  --proposer-model claude-sonnet-4-6 \
  --builder-model claude-haiku-4-5 \
  --runs 3 \
  --budget-limit 10 \
  --max-iterations 10
```

### Output

Prints an evolution report upon completion:

```
Loaded 5 training tasks, 3 validation tasks
Starting evolution loop...

=== Evolution Report ===
Iterations:  7
Total cost:  $2.3140
Best score:  0.8833
Best skills: chain-of-thought, geographic-lookup

--- Frontier ---
  gen3-geographic-lookup: 0.8833
  gen1-chain-of-thought: 0.7500
  baseline: 0.5000

--- History ---
  [+] chain-of-thought (+0.250)
  [-] verbose-output (-0.100)
  [+] geographic-lookup (+0.133)
```

State is saved to `.evolver/state.json`.

---

## `evolver status`

Show the last evolution run from `.evolver/state.json`.

```bash
npx evolver status
```

### Output

```
Last run:        2026-03-30T03:15:00.000Z
Iterations:      7
Total cost:      $2.3140
Best program:    gen3-geographic-lookup (score: 0.8833)
Frontier size:   3
History entries: 3
Duration:        45.2s

Best skills:
  - chain-of-thought: When the task requires multi-step reasoning
  - geographic-lookup: When the task asks about geography or capitals
```

If no state file exists, prints:

```
No evolution state found. Run 'evolver evolve' first.
```

---

## `evolver skills list`

List discovered skills in the skills directory.

```bash
npx evolver skills list [options]
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--skills-dir <path>` | string | `./skills` | Skills directory to scan |

### Example

```bash
npx evolver skills list --skills-dir ./skills
```

### Output

```
Found 2 skill(s):

  chain-of-thought              Multi-step reasoning with verification
  geographic-lookup             Geographic knowledge lookup table
```

Skills are detected by scanning for directories containing a `SKILL.md` file. The description is extracted from the YAML frontmatter `description` field.

---

## `evolver skills export`

Export skills to another agent format.

```bash
npx evolver skills export [options]
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--skills-dir <path>` | string | `./skills` | Skills directory |
| `--format <fmt>` | string | `cursor` | Output format: `cursor` |
| `--output <path>` | string | stdout | Output file path |

### Examples

```bash
# Export to a file
npx evolver skills export --format cursor --output .cursorrules

# Export to stdout (for piping)
npx evolver skills export --format cursor

# Pipe to another tool
npx evolver skills export --format cursor | pbcopy
```

### Cursor Format Output

The `cursor` format generates a single document with `##` section headers per skill, each referencing a `rules/{name}.md` file:

```markdown
# Agent Skills

## chain-of-thought

[skill content without frontmatter]

---

## geographic-lookup

[skill content without frontmatter]
```

---

## `evolver skills test`

Validate skills across different model adapters.

```bash
npx evolver skills test [options]
```

### Options

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--skills-dir <path>` | string | `./skills` | Skills directory |
| `--task-dir <path>` | string | none | Tasks directory (required with `--cross-model`) |
| `--cross-model` | boolean | `false` | Run cross-model transfer test |
| `--source <adapter>` | string | `claude-code` | Source adapter name |
| `--target <adapters>` | string | `cursor,codex` | Comma-separated target adapter names |

### Example

```bash
npx evolver skills test \
  --cross-model \
  --task-dir ./tasks \
  --skills-dir ./skills \
  --source claude-code \
  --target cursor,codex
```

### Output

```
Cross-model test: claude-code -> cursor, codex
Skills: chain-of-thought, geographic-lookup
Tasks: 3

Source (claude-code): 0.8833
Target (cursor):     0.8500 (-0.0333)
Target (codex):      0.7667 (-0.1167)

Transfer rate: 91.5%
```

**Transfer rate** is calculated as: `avg(targetScore / sourceScore)` across all target adapters. A rate above 80% indicates good skill portability.

Without `--cross-model`, the command prints usage guidance:

```
Use --cross-model to run transfer tests.
```

---

## State File

The evolution state is persisted to `.evolver/state.json` after each `evolve` run. Structure:

```json
{
  "lastRun": "2026-03-30T03:15:00.000Z",
  "report": {
    "bestProgram": { "id": "gen3-geographic-lookup", "score": 0.8833, "skills": [...] },
    "frontier": [...],
    "iterations": 7,
    "totalCostUsd": 2.314,
    "history": [...],
    "durationMs": 45200
  },
  "skillsDir": "./skills"
}
```

This file is read by `evolver status` and can be used for programmatic integration.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (missing tasks, unknown adapter, missing required flags) |
