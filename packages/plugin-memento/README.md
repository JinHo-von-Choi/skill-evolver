# @evolver/plugin-memento

> Memento MCP memory system plugin for the Evolver evolution loop.

## Installation

```bash
pnpm add @evolver/plugin-memento
```

## Usage

```typescript
import { MementoClient, MementoPlugin } from "@evolver/plugin-memento";

// Create client
const client = new MementoClient({
  url:       "https://pmcp.nerdvana.kr/mcp",
  accessKey: process.env.MEMENTO_ACCESS_KEY!,
});

// Create plugin (implements @evolver/core Plugin interface)
const plugin = new MementoPlugin(client);

// Pass to EvolutionLoop
const loop = new EvolutionLoop({
  // ...other options
  plugins: [plugin],
});
```

The plugin hooks into the evolution loop lifecycle:

| Hook | Behavior |
|------|----------|
| `onFailure` | Recalls past similar errors from memory |
| `onProposal` | Recalls past skill evolution history |
| `onEvaluation` | Remembers skill evaluation results |
| `onFrontierUpdate` | Remembers frontier snapshots |

## API

### `MementoPlugin`

Bridges the Evolver plugin system with memento-mcp's remember/recall/forget tools.

```typescript
new MementoPlugin(client: MementoClient)
// Plugin.name = "memento"
// Plugin.hooks: { onFailure, onProposal, onEvaluation, onFrontierUpdate }
```

### `MementoClient`

MCP JSON-RPC client for memento-mcp. Handles `initialize` handshake and `tools/call` invocations.

```typescript
new MementoClient(config: MementoClientConfig)
client.remember(params: RememberParams): Promise<{ id: string }>
client.recall(params: RecallParams): Promise<RecallResult>
client.forget(params: ForgetParams): Promise<{ success: boolean }>
```

### Types

```typescript
interface MementoClientConfig {
  url:       string;   // MCP server URL
  accessKey: string;   // Bearer token
}

interface RememberParams {
  content:     string;
  topic:       string;
  type:        string;
  importance?: number;
}

interface RecallParams {
  keywords?: string[];
  topic?:    string;
  type?:     string;
}

interface ForgetParams {
  id: string;
}

interface MementoFragment {
  id:      string;
  content: string;
  type:    string;
}

interface RecallResult {
  fragments: MementoFragment[];
}
```

## Configuration

| Option | Type | Description |
|--------|------|-------------|
| `url` | `string` | Memento MCP server endpoint |
| `accessKey` | `string` | Bearer authentication token |

## Testing

```bash
pnpm test
```
