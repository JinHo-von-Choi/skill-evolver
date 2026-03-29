# @evolver/proposer

> LLM-powered skill proposal generator with failure pattern analysis.

## Installation

```bash
pnpm add @evolver/proposer
```

## Usage

```typescript
import { LlmProposer, groupByPattern } from "@evolver/proposer";

// Create a proposer (implements @evolver/core Proposer interface)
const proposer = new LlmProposer({
  model:  "claude-sonnet-4-6", // optional, default
  apiKey: process.env.ANTHROPIC_API_KEY, // optional, falls back to env
});

// Propose a skill from failures
const proposal = await proposer.propose(failures, feedbackHistory, pluginContext);
// proposal: { action, skillName, trigger, description, rationale, editTarget? }

// Analyze failure patterns independently
const groups = groupByPattern(failures);
// groups: FailureGroup[] with pattern, failures, summary
```

## API

### `LlmProposer`

Calls the Anthropic API to generate a `SkillProposal` based on failure analysis and proposal history.

```typescript
new LlmProposer(config?: LlmProposerConfig)
proposer.propose(
  failures: Failure[],
  history:  FeedbackEntry[],
  context?: PluginContext,
): Promise<SkillProposal>
```

### `groupByPattern(failures: Failure[]): FailureGroup[]`

Groups failures by normalized error message + category. O(n) single pass. Returns groups with pattern key, failure list, and human-readable summary.

### `FailureGroup`

```typescript
interface FailureGroup {
  pattern:  string;      // "category::normalized-error"
  failures: Failure[];
  summary:  string;      // Human-readable group summary
}
```

### `LlmProposerConfig`

```typescript
interface LlmProposerConfig {
  model?:  string; // Anthropic model ID (default: "claude-sonnet-4-6")
  apiKey?: string; // API key (default: ANTHROPIC_API_KEY env var)
}
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `string` | `"claude-sonnet-4-6"` | Anthropic model for proposal generation |
| `apiKey` | `string` | `ANTHROPIC_API_KEY` env | Anthropic API key |

## Testing

```bash
pnpm test
```
