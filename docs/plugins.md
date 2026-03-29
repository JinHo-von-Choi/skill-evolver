# Plugins

Plugins hook into the evolution loop lifecycle to extend its behavior. Common use cases include long-term memory, custom logging, external notifications, and experiment tracking.

## Plugin Interface

```typescript
import type { Plugin } from "@evolver/core";

const myPlugin: Plugin = {
  name: "my-plugin",
  hooks: {
    async onIterationStart(ctx)   { /* IterationContext    */ },
    async onFailure(failures)     { /* returns PluginContext */ },
    async onProposal(proposal)    { /* returns PluginContext */ },
    async onEvaluation(result)    { /* void                 */ },
    async onFrontierUpdate(front) { /* void                 */ },
  },
};
```

All hooks are optional. Implement only the hooks you need.

## Hook Reference

### `onIterationStart(ctx: IterationContext): Promise<void>`

Called at the start of each evolution iteration, before parent selection.

**`IterationContext`:**

```typescript
interface IterationContext {
  iteration:  number;      // current iteration index (0-based)
  frontier:   Program[];   // current frontier snapshot
  history:    FeedbackEntry[];  // all feedback entries so far
  costSoFar:  number;      // total USD spent so far
}
```

**Use cases:** logging, progress reporting, conditional early termination.

### `onFailure(failures: Failure[]): Promise<PluginContext>`

Called after failures are collected from the training run, before the proposer is invoked.

**`Failure`:**

```typescript
interface Failure {
  task:   Task;
  result: ExecutionResult;
}
```

**Return value:** A `PluginContext` (key-value object) that is merged with contexts from other plugins and forwarded to the proposer's `propose()` call. This allows plugins to inject additional context (e.g., recalled memories) into the proposal generation.

**Use cases:** recall past similar failures, enrich failure data with external context.

### `onProposal(proposal: SkillProposal): Promise<PluginContext>`

Called after the proposer generates a skill proposal, before the builder materializes it.

**`SkillProposal`:**

```typescript
interface SkillProposal {
  action:      "create" | "edit";
  skillName:   string;
  trigger:     string;
  description: string;
  rationale:   string;
  editTarget?: string;
}
```

**Return value:** A `PluginContext` forwarded to the builder's `build()` call.

**Use cases:** recall past skill outcomes, augment proposals with domain knowledge.

### `onEvaluation(result: EvaluationResult): Promise<void>`

Called after a candidate program is evaluated and the frontier is updated.

**`EvaluationResult`:**

```typescript
interface EvaluationResult {
  programId: string;
  skillName: string;
  score:     number;
  delta:     number;    // scoreAfter - scoreBefore
  accepted:  boolean;   // whether the candidate entered the frontier
}
```

**Use cases:** persist evaluation outcomes, log metrics, send notifications.

### `onFrontierUpdate(frontier: Program[]): Promise<void>`

Called after `onEvaluation`, with the current frontier snapshot.

**Use cases:** snapshot frontier state, track diversity metrics over time.

## Hook Execution Order

When multiple plugins are registered, hooks are called sequentially in registration order. For `onFailure` and `onProposal`, the returned `PluginContext` objects are merged with spread syntax (`{ ...ctx1, ...ctx2 }`), so later plugins can override keys from earlier ones.

## Built-in Plugin: Memento

**Package:** `@evolver/plugin-memento`

Connects to a [memento-mcp](https://github.com/nerdvana) server for long-term semantic memory across evolution sessions.

### Configuration

```bash
evolver evolve \
  --task-dir ./tasks \
  --plugin memento \
  --memento-url https://your-memento-server/mcp \
  --memento-key YOUR_ACCESS_KEY
```

Both `--memento-url` and `--memento-key` are required when `--plugin memento` is specified.

### How It Works

The plugin uses three memento-mcp operations: `remember`, `recall`, and `forget`.

**`onFailure` hook:**
1. Extracts keywords from failure error messages and task categories.
2. Calls `recall({ keywords, type: "error" })` to find past similar failures.
3. Returns `{ relatedFailures: fragments }` as `PluginContext`.

This context is forwarded to the proposer, giving it access to past failure patterns and their resolutions.

**`onProposal` hook:**
1. Recalls memories related to the proposed skill name under the `skill_evolution` topic.
2. Returns `{ relatedSkills: fragments }` as `PluginContext`.

This context is forwarded to the builder, informing it about past skill attempts.

**`onEvaluation` hook:**
1. Remembers the evaluation outcome with content like: `Skill "chain-of-thought" eval: score 0.75, delta +0.25, accepted true`.
2. Type is `"fact"` for positive deltas, `"error"` for negative.
3. Importance is scaled by `min(1, abs(delta) * 2)`.

**`onFrontierUpdate` hook:**
1. Remembers a compact frontier summary (e.g., `gen3-lookup(0.883), baseline(0.500)`).
2. Stored as a low-importance fact (`importance: 0.3`).

### MementoClient

The `MementoClient` communicates with the memento-mcp server via the MCP JSON-RPC protocol over HTTP:

```typescript
import { MementoClient } from "@evolver/plugin-memento";

const client = new MementoClient({
  url: "https://your-server/mcp",
  accessKey: "your-key",
});

// Remember something
await client.remember({
  content: "Geographic tasks need lookup tables",
  topic: "skill_evolution",
  type: "fact",
  importance: 0.7,
});

// Recall related memories
const result = await client.recall({
  keywords: ["geography", "lookup"],
  type: "error",
});
console.log(result.fragments);

// Forget a specific memory
await client.forget({ id: "fragment-id" });
```

The client handles:
- MCP protocol initialization (protocol version `2024-11-05`)
- `tools/call` invocations for `remember`, `recall`, and `forget`
- JSON-RPC response parsing (extracts text content blocks)
- Bearer token authentication

### Error Handling

All memento operations are wrapped in try/catch blocks. Failures in the memento plugin never terminate the evolution loop. If the memento server is unreachable, the loop continues without memory context.

## Writing a Custom Plugin

### Example: Logging Plugin

```typescript
import type { Plugin, IterationContext, Failure, EvaluationResult } from "@evolver/core";

export const loggingPlugin: Plugin = {
  name: "logger",
  hooks: {
    async onIterationStart(ctx: IterationContext) {
      console.log(`[iter ${ctx.iteration}] frontier=${ctx.frontier.length}, cost=$${ctx.costSoFar.toFixed(2)}`);
    },

    async onFailure(failures: Failure[]) {
      console.log(`[failures] ${failures.length} task(s) failed`);
      return {};  // no additional context
    },

    async onEvaluation(result: EvaluationResult) {
      const status = result.accepted ? "ACCEPTED" : "REJECTED";
      console.log(`[eval] ${result.skillName}: ${status} (delta: ${result.delta.toFixed(3)})`);
    },
  },
};
```

### Example: Webhook Notification Plugin

```typescript
import type { Plugin, EvaluationResult, Program } from "@evolver/core";

export const webhookPlugin: Plugin = {
  name: "webhook",
  hooks: {
    async onEvaluation(result: EvaluationResult) {
      if (result.accepted && result.delta > 0.1) {
        await fetch("https://hooks.example.com/evolver", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "skill_accepted",
            skill: result.skillName,
            score: result.score,
            delta: result.delta,
          }),
        });
      }
    },
  },
};
```

### Registering Custom Plugins

Currently, plugins are loaded via the CLI's `--plugin` flag with built-in resolution. To add a custom plugin:

1. Create your plugin package under `packages/plugin-<name>/`.
2. Implement the `Plugin` interface from `@evolver/core`.
3. Add resolution logic in `packages/cli/src/commands/evolve.ts` in the `resolvePlugins()` function:

```typescript
if (opts.plugin === "my-plugin") {
  const mod = await import("@evolver/plugin-my-plugin");
  plugins.push(new mod.MyPlugin(/* config */));
}
```

4. Add the package to the workspace and rebuild.
