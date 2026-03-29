# Configuration

This document covers task directory configuration, the `EvolutionConfig` options, scorer types, and example configurations.

## Task Directory Structure

```
tasks/
  config.yaml              # global task config
  train/                   # training tasks (used for failure collection)
    task-001.yaml
    task-002.yaml
    ...
  validation/              # validation tasks (used for scoring candidates)
    task-010.yaml
    task-011.yaml
    ...
```

### config.yaml Schema

```yaml
# Scoring strategy for all tasks (can be overridden per-task)
scorer: exact-match          # exact-match | fuzzy | llm-judge | custom

# Category labels (informational, used by FailureAnalyzer for grouping)
categories: [math, geography, reasoning]
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `scorer` | `ScorerType` | no | `exact-match` | Default scorer for all tasks |
| `categories` | `string[]` | no | `[]` | Declared categories (informational) |

### Task File Schema

```yaml
id: task-001                           # unique identifier
input: "What is the capital of France?" # prompt sent to the agent
expected: "Paris"                       # expected output for scoring
category: geography                    # category for failure grouping
scorer: fuzzy                          # per-task scorer override
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` | no | filename stem | Unique task identifier |
| `input` | `unknown` | yes | -- | Prompt or structured input |
| `expected` | `unknown` | yes | -- | Expected output for scoring |
| `category` | `string` | no | -- | Category label for failure grouping |
| `scorer` | `ScorerType` | no | from `config.yaml` | Per-task scorer override |

The `input` field can be a string or a structured object. If it is an object, it is serialized to JSON before being passed to the agent CLI.

## EvolutionConfig

The `EvolutionConfig` interface controls the behavior of the evolution loop:

```typescript
interface EvolutionConfig {
  maxIterations:    number;
  epochs:           number;
  failureThreshold: number;
  frontier:         ParetoFrontierConfig;
  runs:             number;
  budgetLimit?:     number;
  maxSkills:        number;
}
```

| Option | Type | CLI Flag | Default | Description |
|--------|------|----------|---------|-------------|
| `maxIterations` | `number` | `--max-iterations` | `10` | Maximum evolution iterations before termination |
| `epochs` | `number` | -- | `1.5` | Epoch multiplier for training (internal) |
| `failureThreshold` | `number` | `--failure-threshold` | `0.5` | Score below this value triggers failure collection |
| `frontier.capacity` | `number` | `--frontier-capacity` | `3` | Number of top programs kept in the Pareto frontier |
| `frontier.selectionStrategy` | `string` | -- | `"round-robin"` | Parent selection strategy: `"round-robin"` or `"tournament"` |
| `runs` | `number` | `--runs` | `3` | Independent runs per evaluation for statistical rigor |
| `budgetLimit` | `number?` | `--budget-limit` | none | Maximum USD spend before early termination |
| `maxSkills` | `number` | -- | `20` | Maximum skills per program (ConflictDetector cap) |

### ParetoFrontierConfig

```typescript
interface ParetoFrontierConfig {
  capacity:          number;
  selectionStrategy: "round-robin" | "tournament";
}
```

### AdaptiveFrontierConfig

When using the adaptive frontier, these additional fields apply:

```typescript
interface AdaptiveFrontierConfig extends ParetoFrontierConfig {
  adaptive:     boolean;    // enable adaptive mode
  minCapacity:  number;     // minimum frontier size
  maxCapacity:  number;     // maximum frontier size
}
```

## Scorer Types

### `exact-match`

Returns `1` if the output exactly equals the expected value, `0` otherwise. Uses deep JSON comparison as a fallback.

```typescript
exactMatch("Seoul", "Seoul")           // 1
exactMatch("seoul", "Seoul")           // 0
exactMatch({a: 1}, {a: 1})            // 1 (JSON comparison)
```

### `fuzzy`

Case-insensitive comparison with partial match support.

```typescript
fuzzy("Seoul", "Seoul")                // 1   (exact)
fuzzy("The capital is Seoul", "Seoul") // 0.5 (contains)
fuzzy("Tokyo", "Seoul")               // 0   (no match)
```

### `llm-judge`

Delegates scoring to an LLM. The LLM evaluates the output against the expected value and returns a score between 0 and 1. Implementation is adapter-specific.

### `custom`

User-provided scoring function. Register a custom scorer by extending the adapter's scorer registry.

## AdapterConfig

Each adapter is configured with:

```typescript
interface AdapterConfig {
  name:        string;        // "claude-code" | "cursor" | "codex"
  command:     string;        // CLI command to execute
  skillsPath:  string;        // default skills output directory
  skillFormat: "markdown" | "json" | "yaml";
  timeout:     number;        // per-task timeout in ms
  concurrency: number;        // max parallel task executions
}
```

## Example Configurations

### Minimal: Quick Smoke Test

```bash
npx evolver evolve \
  --task-dir ./tasks \
  --max-iterations 3 \
  --runs 1 \
  --budget-limit 2
```

Fast iteration with minimal cost. Good for verifying the setup works.

### Standard: Balanced Quality vs Cost

```bash
npx evolver evolve \
  --task-dir ./tasks \
  --adapter claude-code \
  --proposer-model claude-sonnet-4-6 \
  --builder-model claude-haiku-4-5 \
  --runs 3 \
  --max-iterations 10 \
  --frontier-capacity 3 \
  --budget-limit 10
```

The default configuration. Uses Sonnet for analysis (higher quality) and Haiku for skill building (lower cost).

### Deep: Maximum Quality

```bash
npx evolver evolve \
  --task-dir ./tasks \
  --adapter claude-code \
  --proposer-model claude-sonnet-4-6 \
  --builder-model claude-sonnet-4-6 \
  --runs 5 \
  --max-iterations 20 \
  --frontier-capacity 5 \
  --failure-threshold 0.7 \
  --budget-limit 50
```

More iterations, more runs per evaluation, larger frontier, and a stricter failure threshold. Use when quality matters more than cost.

### With Memento: Cross-Session Memory

```bash
npx evolver evolve \
  --task-dir ./tasks \
  --adapter claude-code \
  --runs 3 \
  --max-iterations 10 \
  --plugin memento \
  --memento-url https://your-server/mcp \
  --memento-key YOUR_KEY
```

Enables long-term memory. Past failures and skill outcomes are recalled during proposal generation. Useful for iterative refinement across multiple evolution sessions.

### Cross-Model Validation

```bash
# First, run evolution to discover skills
npx evolver evolve --task-dir ./tasks --adapter claude-code

# Then validate across adapters
npx evolver skills test \
  --cross-model \
  --task-dir ./tasks \
  --source claude-code \
  --target cursor,codex
```

Verifies skill transferability. The transfer rate indicates what percentage of the source score is retained on target adapters.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | yes | API key for the Anthropic SDK (used by proposer and builder) |

The proposer and builder LLMs are instantiated via the `@anthropic-ai/sdk` package, which reads `ANTHROPIC_API_KEY` from the environment.
