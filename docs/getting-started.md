# Getting Started

This guide walks through installing Evolver, creating a task set, running your first evolution, and exporting the discovered skills.

## Prerequisites

- Node.js 20+
- pnpm (recommended) or npm
- An Anthropic API key (`ANTHROPIC_API_KEY` environment variable)
- One of the supported agent CLIs installed: `claude` (Claude Code), `cursor`, or `codex`

## Installation

```bash
git clone <repo-url> && cd evolver
pnpm install
pnpm build
```

Verify the CLI is available:

```bash
npx evolver --version
```

## Step 1: Create a Task Directory

A task directory contains a `config.yaml`, a `train/` folder, and a `validation/` folder.

```
my-tasks/
  config.yaml
  train/
    task-001.yaml
    task-002.yaml
    task-003.yaml
  validation/
    task-010.yaml
    task-011.yaml
```

### config.yaml

```yaml
scorer: exact-match          # exact-match | fuzzy | llm-judge | custom
categories: [math, geography, reasoning]
```

### Task files

Each YAML file defines one task:

```yaml
id: task-001
input: "What is the capital of South Korea?"
expected: "Seoul"
category: geography
```

Fields:

| Field | Required | Description |
|-------|----------|-------------|
| `id` | no | Unique identifier. Defaults to the filename without extension. |
| `input` | yes | The prompt or input data sent to the agent. |
| `expected` | yes | The expected output for scoring. |
| `category` | no | Category label for failure grouping. |
| `scorer` | no | Per-task scorer override. Falls back to `config.yaml`. |

You can use the bundled example as a starting point:

```bash
cp -r examples/claude-code/tasks ./my-tasks
```

## Step 2: Run Your First Evolution

```bash
export ANTHROPIC_API_KEY=sk-ant-...

npx evolver evolve \
  --task-dir ./my-tasks \
  --adapter claude-code \
  --proposer-model claude-sonnet-4-6 \
  --builder-model claude-haiku-4-5 \
  --runs 3 \
  --max-iterations 5 \
  --budget-limit 5
```

What happens during the run:

1. The loop measures a **baseline** score (no skills) on the validation set.
2. For each iteration:
   - A parent program is selected from the Pareto frontier (round-robin).
   - The parent is executed against the training tasks.
   - Failures (score below `--failure-threshold`) are collected and grouped by error pattern.
   - The **Proposer** LLM analyzes failures and proposes a new skill.
   - The **Builder** LLM materializes the proposal into a SKILL.md file.
   - The candidate program (parent skills + new skill) is validated.
   - If the score improves, the candidate enters the Pareto frontier.
3. The loop terminates when `--max-iterations` or `--budget-limit` is reached.

## Step 3: Read the Report

After the loop finishes, a report is printed:

```
=== Evolution Report ===
Iterations:  5
Total cost:  $1.2340
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

- **Frontier** shows the top-k programs by score.
- **History** shows every proposal with `[+]` for accepted and `[-]` for rejected, plus the score delta.

The full state is persisted to `.evolver/state.json`. View it anytime:

```bash
npx evolver status
```

## Step 4: Inspect Discovered Skills

List skills in the output directory:

```bash
npx evolver skills list --skills-dir ./skills
```

Each skill is a directory containing a `SKILL.md` file with YAML frontmatter (`name`, `description`, `trigger`) and procedural instructions.

## Step 5: Export Skills

Export discovered skills for use in another agent:

```bash
# Export to Cursor format (.cursorrules + rules/)
npx evolver skills export --format cursor --output .cursorrules

# Export to stdout (for piping)
npx evolver skills export --format cursor
```

## Step 6: Cross-Model Validation (Optional)

Verify that skills discovered on one agent transfer to others:

```bash
npx evolver skills test \
  --cross-model \
  --task-dir ./my-tasks \
  --source claude-code \
  --target cursor,codex
```

Output:

```
Source (claude-code): 0.8833
Target (cursor):     0.8500 (-0.0333)
Target (codex):      0.7667 (-0.1167)

Transfer rate: 91.5%
```

## Step 7: Enable Long-Term Memory (Optional)

Connect to a memento-mcp server so that failure patterns and skill outcomes persist across evolution sessions:

```bash
npx evolver evolve \
  --task-dir ./my-tasks \
  --plugin memento \
  --memento-url https://your-memento-server/mcp \
  --memento-key YOUR_ACCESS_KEY
```

The memento plugin recalls past failures during proposal generation and remembers skill evaluation outcomes for future sessions. See [Plugins](plugins.md) for details.

## Next Steps

- [Architecture](architecture.md) -- understand the evolution loop internals
- [Configuration](configuration.md) -- all config options explained
- [Adapters](adapters.md) -- write a custom adapter for your agent
- [Plugins](plugins.md) -- extend the loop with custom hooks
- [CLI Reference](cli-reference.md) -- every command and flag
